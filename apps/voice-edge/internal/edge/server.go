package edge

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/audio"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/media"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/rtp"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sdp"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sip"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/speech"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/turn"
)

const (
	registerExpiresSeconds = 300
	registerRefreshEvery   = 4 * time.Minute
	sipReadTimeout         = 500 * time.Millisecond
	rtpFrameDuration       = 20 * time.Millisecond
	voiceTurnProvider      = "easybell_voice_edge"
)

type Server struct {
	cfg               config.Config
	logger            *slog.Logger
	portPool          *media.PortPool
	speechProvider    speech.Provider
	turnClient        turnSender
	greetingMu        sync.Mutex
	greetingPCM       speech.PCMBuffer
	greetingReady     bool
	greetingDone      chan struct{}
	sessionsMu        sync.Mutex
	sessions          map[string]*CallSession
	registerResponses chan sip.Message
	conn              *net.UDPConn
	registrarAddr     *net.UDPAddr
	cseq              atomic.Uint32
}

type CallSession struct {
	CallID      string
	AssistantID string
	From        string
	To          string
	ToTag       string
	Codec       sdp.Codec
	RTP         *media.RTPSession
	VAD         *audio.VAD
	Context     context.Context
	Cancel      context.CancelFunc
	Phase       string
	StartedAt   time.Time
	processing  atomic.Bool
	greeting    atomic.Bool
}

type turnSender interface {
	Send(ctx context.Context, assistantID string, payload turn.Request) (turn.Response, error)
}

func New(cfg config.Config, logger *slog.Logger) (*Server, error) {
	pool, err := media.NewPortPool(cfg.RTPPortMin, cfg.RTPPortMax)
	if err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		cfg:               cfg,
		logger:            logger,
		portPool:          pool,
		speechProvider:    speech.NewGeminiProvider(cfg.Gemini),
		turnClient:        turn.Client{BaseURL: cfg.VoiceTurnURL, Secret: cfg.VoiceSecret, HTTPClient: &http.Client{Timeout: 30 * time.Second}},
		sessions:          map[string]*CallSession{},
		registerResponses: make(chan sip.Message, 8),
	}, nil
}

func (server *Server) Start(ctx context.Context) error {
	localAddr, err := net.ResolveUDPAddr("udp", server.cfg.SIPBind)
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp", localAddr)
	if err != nil {
		return err
	}
	server.conn = conn
	defer conn.Close()

	registrarAddr, err := resolveRegistrar(server.cfg.Easybell.Registrar)
	if err != nil {
		return err
	}
	server.registrarAddr = registrarAddr

	go server.registrationLoop(ctx)
	return server.readLoop(ctx)
}

func (server *Server) readLoop(ctx context.Context) error {
	buffer := make([]byte, 65535)
	for {
		if err := server.conn.SetReadDeadline(time.Now().Add(sipReadTimeout)); err != nil {
			return err
		}
		n, remote, err := server.conn.ReadFromUDP(buffer)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				select {
				case <-ctx.Done():
					return nil
				default:
					continue
				}
			}
			return err
		}
		message, err := sip.ParseMessage(string(buffer[:n]))
		if err != nil {
			server.logger.Warn("rejected malformed sip message", "error", err)
			continue
		}
		server.handleMessage(ctx, message, remote)
	}
}

func (server *Server) handleMessage(ctx context.Context, message sip.Message, remote *net.UDPAddr) {
	if message.IsResponse() {
		if strings.Contains(strings.ToUpper(message.Header("CSeq")), "REGISTER") {
			select {
			case server.registerResponses <- message:
			default:
				server.logger.Warn("dropped register response because channel is full")
			}
		}
		return
	}

	switch message.Method() {
	case "INVITE":
		server.handleInvite(ctx, message, remote)
	case "ACK":
		server.handleACK(message.Header("Call-ID"))
	case "BYE", "CANCEL":
		server.endSession(message.Header("Call-ID"))
		server.sendResponse(message, remote, 200, "OK", "")
	default:
		server.sendResponse(message, remote, 405, "Method Not Allowed", "")
	}
}

func (server *Server) handleInvite(ctx context.Context, request sip.Message, remote *net.UDPAddr) {
	callID := request.Header("Call-ID")
	if callID == "" {
		server.sendResponse(request, remote, 400, "Bad Request", "")
		return
	}
	if existing := server.getSession(callID); existing != nil {
		switch existing.Phase {
		case "ringing":
			server.sendMessage(sip.ResponseFor(request, 180, "Ringing", ""), remote)
		case "answered", "active", "greeting":
			server.sendAnswer(request, remote, existing)
		}
		return
	}

	trying := sip.ResponseFor(request, 100, "Trying", "")
	server.sendMessage(trying, remote)

	assistantID, err := sip.UserFromURI(request.RequestURI())
	if err != nil {
		server.sendResponse(request, remote, 404, "Not Found", "")
		return
	}
	if server.cfg.AssistantID != "" {
		assistantID = server.cfg.AssistantID
	}
	offer, err := sdp.ParseOffer(request.Body)
	if err != nil {
		server.logger.Warn("invite has invalid sdp", "callId", callID, "error", err)
		server.sendResponse(request, remote, 400, "Bad Request", "")
		return
	}
	codec, ok := offer.PreferredCodec()
	if !ok {
		server.sendResponse(request, remote, 488, "Not Acceptable Here", "")
		return
	}

	ringing := sip.ResponseFor(request, 180, "Ringing", "")
	server.sendMessage(ringing, remote)

	rtpSession, err := media.OpenRTPSession("0.0.0.0", server.portPool, uint8(codec.PayloadType))
	if err != nil {
		server.logger.Error("failed to allocate rtp session", "callId", callID, "error", err)
		server.sendResponse(request, remote, 503, "Service Unavailable", "")
		return
	}
	if remoteRTP, err := net.ResolveUDPAddr("udp", net.JoinHostPort(offer.ConnectionIP, strconv.Itoa(offer.MediaPort))); err == nil {
		rtpSession.SetRemote(remoteRTP)
	}
	callCtx, cancel := context.WithCancel(ctx)
	toTag := "edge-" + randomHex(6)
	session := &CallSession{
		CallID:      callID,
		AssistantID: assistantID,
		From:        sip.ExtractUserFromHeader(request.Header("From")),
		To:          sip.ExtractUserFromHeader(request.Header("To")),
		ToTag:       toTag,
		Codec:       codec,
		RTP:         rtpSession,
		VAD:         audio.NewTelephonyVAD(),
		Context:     callCtx,
		Cancel:      cancel,
		Phase:       "ringing",
		StartedAt:   time.Now(),
	}
	server.storeSession(session)
	go func() {
		err := rtpSession.ReadLoop(callCtx, func(packet rtp.Packet, _ *net.UDPAddr) {
			server.handleRTPPacket(callCtx, session, packet)
		})
		if err != nil {
			server.logger.Warn("rtp read loop ended with error", "callId", callID, "error", err)
		}
	}()
	go server.warmGreeting(callCtx)
	go server.answerAfterDelay(callCtx, session, request, remote)

	server.logger.Info(
		"accepted inbound invite",
		"callId", callID,
		"assistantId", assistantID,
		"codec", codec.Name,
		"rtpPort", rtpSession.Port,
		"answerDelayMs", server.cfg.AnswerDelay.Milliseconds(),
	)
}

func (server *Server) answerAfterDelay(ctx context.Context, session *CallSession, request sip.Message, remote *net.UDPAddr) {
	if session == nil {
		return
	}
	if server.cfg.AnswerDelay > 0 {
		timer := time.NewTimer(server.cfg.AnswerDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
	select {
	case <-ctx.Done():
		return
	default:
	}
	server.markSessionPhase(session.CallID, "answered")
	server.sendAnswer(request, remote, session)
	server.logger.Info("answered inbound invite", "callId", session.CallID)
}

func (server *Server) sendAnswer(request sip.Message, remote *net.UDPAddr, session *CallSession) {
	if session == nil {
		return
	}
	answer := sip.ResponseFor(request, 200, "OK", session.ToTag)
	answer.SetHeader("Contact", server.contactHeader(session.AssistantID))
	answer.SetHeader("Content-Type", "application/sdp")
	answer.Body = sdp.Answer(server.cfg.PublicIP, session.RTP.Port, session.Codec)
	server.sendMessage(answer, remote)
}

func (server *Server) handleACK(callID string) {
	session := server.getSession(callID)
	if session == nil {
		return
	}
	server.markSessionPhase(callID, "active")
	go server.playGreeting(session.Context, session)
}

func (server *Server) handleRTPPacket(ctx context.Context, session *CallSession, packet rtp.Packet) {
	if session == nil || session.VAD == nil {
		return
	}
	if packet.PayloadType != uint8(session.Codec.PayloadType) {
		return
	}
	if session.processing.Load() {
		return
	}
	samples, err := audio.DecodeTelephonyPayload(session.Codec, packet.Payload)
	if err != nil {
		server.logger.Warn("failed to decode rtp payload", "callId", session.CallID, "error", err)
		return
	}
	utterance, ok := session.VAD.Feed(samples)
	if !ok {
		return
	}
	if !session.processing.CompareAndSwap(false, true) {
		return
	}
	server.logger.Info(
		"caller utterance detected",
		"callId", session.CallID,
		"durationMs", durationMillis(len(utterance), session.Codec.ClockRate),
	)
	go func() {
		defer func() {
			session.VAD.Reset()
			session.processing.Store(false)
		}()
		if err := server.processUtterance(ctx, session, utterance); err != nil {
			server.logger.Warn("failed to process caller utterance", "callId", session.CallID, "error", err)
		}
	}()
}

func (server *Server) warmGreeting(ctx context.Context) {
	if strings.TrimSpace(server.cfg.GreetingText) == "" {
		return
	}
	if _, err := server.greetingPCMFor(ctx); err != nil {
		server.logger.Warn("failed to warm greeting", "error", err)
	}
}

func (server *Server) playGreeting(ctx context.Context, session *CallSession) {
	if session == nil || !session.greeting.CompareAndSwap(false, true) {
		return
	}
	text := strings.TrimSpace(server.cfg.GreetingText)
	if text == "" {
		return
	}
	if !session.processing.CompareAndSwap(false, true) {
		return
	}
	server.markSessionPhase(session.CallID, "greeting")
	defer func() {
		if session.VAD != nil {
			session.VAD.Reset()
		}
		session.processing.Store(false)
		server.markSessionPhase(session.CallID, "active")
	}()
	pcm, err := server.greetingPCMFor(ctx)
	if err != nil {
		server.logger.Warn("failed to synthesize greeting", "callId", session.CallID, "error", err)
		return
	}
	if len(pcm.Samples) == 0 {
		return
	}
	if err := server.sendPCM(ctx, session, pcm); err != nil {
		server.logger.Warn("failed to send greeting", "callId", session.CallID, "error", err)
		return
	}
	server.logger.Info("assistant greeting sent", "callId", session.CallID)
}

func (server *Server) greetingPCMFor(ctx context.Context) (speech.PCMBuffer, error) {
	for {
		server.greetingMu.Lock()
		if server.greetingReady {
			pcm := clonePCM(server.greetingPCM)
			server.greetingMu.Unlock()
			return pcm, nil
		}
		if done := server.greetingDone; done != nil {
			server.greetingMu.Unlock()
			select {
			case <-ctx.Done():
				return speech.PCMBuffer{}, ctx.Err()
			case <-done:
				continue
			}
		}
		done := make(chan struct{})
		server.greetingDone = done
		server.greetingMu.Unlock()

		pcm, err := server.speechProvider.Synthesize(ctx, strings.TrimSpace(server.cfg.GreetingText), speech.SynthesisOptions{
			Locale: server.cfg.DefaultLocale,
			Voice:  server.cfg.Gemini.TTSVoice,
		})

		server.greetingMu.Lock()
		if err == nil && len(pcm.Samples) > 0 {
			server.greetingPCM = clonePCM(pcm)
			server.greetingReady = true
		}
		server.greetingDone = nil
		close(done)
		server.greetingMu.Unlock()

		return pcm, err
	}
}

func clonePCM(pcm speech.PCMBuffer) speech.PCMBuffer {
	out := speech.PCMBuffer{SampleRate: pcm.SampleRate}
	if len(pcm.Samples) > 0 {
		out.Samples = append([]int16(nil), pcm.Samples...)
	}
	return out
}

func (server *Server) processUtterance(ctx context.Context, session *CallSession, utterance []int16) error {
	if server.speechProvider == nil || server.turnClient == nil {
		return errors.New("speech pipeline is not configured")
	}
	if len(utterance) == 0 {
		return nil
	}
	telephonyRate := session.Codec.ClockRate
	if telephonyRate <= 0 {
		telephonyRate = 8000
	}
	startedAt := time.Now()
	transcript, err := server.speechProvider.Transcribe(ctx, speech.PCMBuffer{
		SampleRate: telephonyRate,
		Samples:    utterance,
	})
	if err != nil {
		return fmt.Errorf("transcribe: %w", err)
	}
	text := strings.TrimSpace(transcript.Text)
	if text == "" {
		return nil
	}
	server.logger.Info(
		"caller utterance transcribed",
		"callId", session.CallID,
		"assistantId", session.AssistantID,
		"durationMs", time.Since(startedAt).Milliseconds(),
	)

	turnStartedAt := time.Now()
	response, err := server.turnClient.Send(ctx, session.AssistantID, turn.Request{
		Text:     text,
		CallID:   session.CallID,
		From:     session.From,
		To:       server.cfg.Easybell.PublicNumber,
		Provider: voiceTurnProvider,
		Locale:   server.cfg.DefaultLocale,
		Metadata: map[string]any{
			"codec":                session.Codec.Name,
			"rtpPacketsReceived":   session.RTP.PacketsReceived.Load(),
			"transcriptConfidence": transcript.Confidence,
		},
	})
	if err != nil {
		return fmt.Errorf("voice turn: %w", err)
	}
	server.logger.Info(
		"voice turn completed",
		"callId", session.CallID,
		"status", response.Status,
		"durationMs", time.Since(turnStartedAt).Milliseconds(),
	)
	reply := strings.TrimSpace(response.Reply)
	if reply == "" {
		return nil
	}
	synthesisStartedAt := time.Now()
	pcm, err := server.speechProvider.Synthesize(ctx, reply, speech.SynthesisOptions{
		Locale: server.cfg.DefaultLocale,
		Voice:  server.cfg.Gemini.TTSVoice,
	})
	if err != nil {
		return fmt.Errorf("synthesize: %w", err)
	}
	server.logger.Info(
		"assistant speech synthesized",
		"callId", session.CallID,
		"durationMs", time.Since(synthesisStartedAt).Milliseconds(),
		"sampleRate", pcm.SampleRate,
		"samples", len(pcm.Samples),
	)
	return server.sendPCM(ctx, session, pcm)
}

func (server *Server) sendPCM(ctx context.Context, session *CallSession, pcm speech.PCMBuffer) error {
	if len(pcm.Samples) == 0 {
		return nil
	}
	telephonyRate := session.Codec.ClockRate
	if telephonyRate <= 0 {
		telephonyRate = 8000
	}
	sourceRate := pcm.SampleRate
	if sourceRate <= 0 {
		sourceRate = telephonyRate
	}
	samples := audio.ConditionForTelephony(pcm.Samples, sourceRate, telephonyRate)
	frameSize := telephonyRate / int(time.Second/rtpFrameDuration)
	if frameSize <= 0 {
		frameSize = 160
	}
	frames := audio.FramePCM(samples, frameSize)
	for index, frame := range frames {
		if index > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(rtpFrameDuration):
			}
		}
		payload, err := audio.EncodeTelephonyPayload(session.Codec, frame)
		if err != nil {
			return err
		}
		if err := session.RTP.SendPayload(payload); err != nil {
			return err
		}
	}
	server.logger.Info(
		"assistant speech sent",
		"callId", session.CallID,
		"frames", len(frames),
		"durationMs", durationMillis(len(samples), telephonyRate),
	)
	return nil
}

func durationMillis(samples int, sampleRate int) int {
	if sampleRate <= 0 {
		return 0
	}
	return samples * 1000 / sampleRate
}

func (server *Server) registrationLoop(ctx context.Context) {
	server.registerOnce(ctx)
	ticker := time.NewTicker(registerRefreshEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			server.registerOnce(ctx)
		}
	}
}

func (server *Server) registerOnce(ctx context.Context) {
	if server.conn == nil || server.registrarAddr == nil {
		return
	}
	callID := "reg-" + randomHex(12)
	cseq := int(server.cseq.Add(1))
	options := sip.RegisterOptions{
		Registrar:   server.cfg.Easybell.Registrar,
		Username:    server.cfg.Easybell.Username,
		FromDomain:  server.cfg.Easybell.FromDomain,
		ContactHost: server.cfg.PublicIP,
		ContactPort: server.localSIPPort(),
		CallID:      callID,
		CSeq:        cseq,
		Branch:      "z9hG4bK-" + randomHex(10),
		Expires:     registerExpiresSeconds,
	}
	request := sip.BuildRegisterRequest(options, "")
	if err := server.sendMessage(request, server.registrarAddr); err != nil {
		server.logger.Warn("failed to send sip register", "error", err)
		return
	}
	response, err := server.waitForRegisterResponse(ctx, callID, 5*time.Second)
	if err != nil {
		server.logger.Warn("sip register timed out", "error", err)
		return
	}
	if response.StatusCode() == 401 || response.StatusCode() == 407 {
		authHeader := response.Header("WWW-Authenticate")
		if authHeader == "" {
			authHeader = response.Header("Proxy-Authenticate")
		}
		challenge := sip.ParseDigestChallenge(authHeader)
		options.CSeq = int(server.cseq.Add(1))
		options.Branch = "z9hG4bK-" + randomHex(10)
		authorization := sip.DigestAuthorization(
			server.cfg.Easybell.Username,
			server.cfg.Easybell.Password,
			"REGISTER",
			"sip:"+server.cfg.Easybell.Registrar,
			challenge,
			randomHex(8),
			"00000001",
		)
		request = sip.BuildRegisterRequest(options, authorization)
		if err := server.sendMessage(request, server.registrarAddr); err != nil {
			server.logger.Warn("failed to send authenticated sip register", "error", err)
			return
		}
		response, err = server.waitForRegisterResponse(ctx, callID, 5*time.Second)
		if err != nil {
			server.logger.Warn("authenticated sip register timed out", "error", err)
			return
		}
	}
	if response.StatusCode() >= 200 && response.StatusCode() < 300 {
		server.logger.Info("sip registration succeeded", "registrar", server.cfg.Easybell.Registrar)
		return
	}
	server.logger.Warn("sip registration failed", "status", response.StatusCode())
}

func (server *Server) waitForRegisterResponse(ctx context.Context, callID string, timeout time.Duration) (sip.Message, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return sip.Message{}, ctx.Err()
		case <-timer.C:
			return sip.Message{}, errors.New("timeout waiting for register response")
		case response := <-server.registerResponses:
			if response.Header("Call-ID") == callID {
				return response, nil
			}
		}
	}
}

func (server *Server) sendResponse(request sip.Message, remote *net.UDPAddr, status int, reason string, toTag string) {
	response := sip.ResponseFor(request, status, reason, toTag)
	server.sendMessage(response, remote)
}

func (server *Server) sendMessage(message sip.Message, remote *net.UDPAddr) error {
	if server.conn == nil {
		return errors.New("sip udp socket is not open")
	}
	_, err := server.conn.WriteToUDP([]byte(message.String()), remote)
	return err
}

func (server *Server) storeSession(session *CallSession) {
	server.sessionsMu.Lock()
	defer server.sessionsMu.Unlock()
	server.sessions[session.CallID] = session
}

func (server *Server) getSession(callID string) *CallSession {
	server.sessionsMu.Lock()
	defer server.sessionsMu.Unlock()
	return server.sessions[callID]
}

func (server *Server) markSessionPhase(callID string, phase string) {
	server.sessionsMu.Lock()
	defer server.sessionsMu.Unlock()
	if session := server.sessions[callID]; session != nil {
		session.Phase = phase
	}
}

func (server *Server) endSession(callID string) {
	server.sessionsMu.Lock()
	session := server.sessions[callID]
	delete(server.sessions, callID)
	server.sessionsMu.Unlock()
	if session == nil {
		return
	}
	session.Cancel()
	if err := session.RTP.Close(); err != nil {
		server.logger.Warn("failed to close rtp session", "callId", callID, "error", err)
	}
	server.logger.Info("ended call session", "callId", callID)
}

func (server *Server) contactHeader(assistantID string) string {
	return fmt.Sprintf("<sip:%s@%s:%d>", assistantID, server.cfg.PublicIP, server.localSIPPort())
}

func (server *Server) localSIPPort() int {
	_, port, err := net.SplitHostPort(server.cfg.SIPBind)
	if err != nil {
		return 5060
	}
	value, err := strconv.Atoi(port)
	if err != nil {
		return 5060
	}
	return value
}

func resolveRegistrar(registrar string) (*net.UDPAddr, error) {
	registrar = strings.TrimPrefix(strings.TrimSpace(registrar), "sip:")
	if registrar == "" {
		return nil, errors.New("empty sip registrar")
	}
	if _, _, err := net.SplitHostPort(registrar); err != nil {
		registrar += ":5060"
	}
	return net.ResolveUDPAddr("udp", registrar)
}

func randomHex(bytesCount int) string {
	buffer := make([]byte, bytesCount)
	if _, err := rand.Read(buffer); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buffer)
}
