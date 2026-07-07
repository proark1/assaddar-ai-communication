package edge

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
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
	ackTimeout             = 45 * time.Second
	voiceTurnProvider      = "easybell_voice_edge"
	ringbackFrequencyHz    = 425.0
	ringbackAmplitude      = 9000.0
)

type Server struct {
	cfg               config.Config
	logger            *slog.Logger
	portPool          *media.PortPool
	speechProvider    speech.Provider
	turnClient        turnSender
	greetingCache     pcmCache
	thinkingCache     pcmCache
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

type pcmCache struct {
	mu    sync.Mutex
	pcm   speech.PCMBuffer
	ready bool
	done  chan struct{}
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

	go server.warmGreeting(ctx)
	go server.warmThinking(ctx)
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
	if existing, phase := server.getSessionAndPhase(callID); existing != nil {
		switch phase {
		case "ringing", "early-media":
			server.sendMessage(sip.ResponseFor(request, 180, "Ringing", existing.ToTag), remote)
			server.sendProgress(request, remote, existing)
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
	go server.answerAfterDelay(callCtx, session, request, remote)

	server.logger.Info(
		"accepted inbound invite",
		"callId", callID,
		"assistantId", assistantID,
		"codec", codec.Name,
		"rtpPort", rtpSession.Port,
		"answerDelayMs", server.cfg.AnswerDelay.Milliseconds(),
		"greetingDelayMs", server.cfg.GreetingDelay.Milliseconds(),
	)
}

func (server *Server) answerAfterDelay(ctx context.Context, session *CallSession, request sip.Message, remote *net.UDPAddr) {
	if session == nil {
		return
	}
	greetingReady := server.startGreetingWarmup(ctx)
	go server.warmThinking(ctx)
	if server.cfg.AnswerDelay > 0 {
		server.markSessionPhase(session.CallID, "early-media")
		server.sendProgress(request, remote, session)
		if err := server.playRingbackUntilReady(ctx, session, server.cfg.AnswerDelay, greetingReady); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			server.logger.Warn("failed to play early media ringback", "callId", session.CallID, "error", err)
		}
	} else if err := waitForGreeting(ctx, greetingReady); err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return
		}
		server.logger.Warn("failed to warm greeting before answer", "callId", session.CallID, "error", err)
	}
	select {
	case <-ctx.Done():
		return
	default:
	}
	server.markSessionPhase(session.CallID, "answered")
	server.sendAnswer(request, remote, session)
	server.logger.Info("answered inbound invite", "callId", session.CallID)
	go server.expireUnackedSession(ctx, session.CallID, ackTimeout)
}

func (server *Server) sendProgress(request sip.Message, remote *net.UDPAddr, session *CallSession) {
	if session == nil {
		return
	}
	progress := sip.ResponseFor(request, 183, "Session Progress", session.ToTag)
	progress.SetHeader("Contact", server.contactHeader(session.AssistantID))
	progress.SetHeader("Content-Type", "application/sdp")
	progress.Body = sdp.Answer(server.cfg.PublicIP, session.RTP.Port, session.Codec)
	server.sendMessage(progress, remote)
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

func (server *Server) expireUnackedSession(ctx context.Context, callID string, timeout time.Duration) {
	if timeout <= 0 {
		return
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-timer.C:
	}
	session, phase := server.getSessionAndPhase(callID)
	if session == nil {
		return
	}
	switch phase {
	case "ringing", "early-media", "answered":
		server.logger.Warn("ending call session without ack", "callId", callID, "phase", phase, "timeoutMs", timeout.Milliseconds())
		server.endSession(callID)
	}
}

func (server *Server) playRingbackUntilReady(ctx context.Context, session *CallSession, minDuration time.Duration, ready <-chan error) error {
	startedAt := time.Now()
	if !session.processing.CompareAndSwap(false, true) {
		return waitForMinimumAndGreeting(ctx, startedAt, minDuration, ready)
	}
	defer session.processing.Store(false)

	telephonyRate := session.Codec.ClockRate
	if telephonyRate <= 0 {
		telephonyRate = 8000
	}
	frameSize := telephonyRate / int(time.Second/rtpFrameDuration)
	if frameSize <= 0 {
		frameSize = 160
	}
	var sendErr error
	var greetingErr error
	greetingReady := ready == nil
	framesSent := 0
	for {
		if !greetingReady {
			select {
			case greetingErr = <-ready:
				greetingReady = true
			default:
			}
		}
		if time.Since(startedAt) >= minDuration && greetingReady {
			break
		}
		frameIndex := framesSent
		if frameIndex > 0 {
			if err := waitForDuration(ctx, rtpFrameDuration); err != nil {
				return err
			}
		}
		frame := ringbackFrame(frameIndex*frameSize, frameSize, telephonyRate)
		payload, err := audio.EncodeTelephonyPayload(session.Codec, frame)
		if err != nil {
			return err
		}
		if err := session.RTP.SendPayload(payload); err != nil && sendErr == nil {
			sendErr = err
		}
		framesSent++
	}
	server.logger.Info(
		"early media ringback sent",
		"callId", session.CallID,
		"frames", framesSent,
		"durationMs", time.Since(startedAt).Milliseconds(),
	)
	if greetingErr != nil {
		return greetingErr
	}
	return sendErr
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

func (server *Server) warmThinking(ctx context.Context) {
	if strings.TrimSpace(server.cfg.ThinkingText) == "" {
		return
	}
	if _, err := server.thinkingPCMFor(ctx); err != nil {
		server.logger.Warn("failed to warm thinking prompt", "error", err)
	}
}

func (server *Server) startGreetingWarmup(ctx context.Context) <-chan error {
	done := make(chan error, 1)
	go func() {
		if strings.TrimSpace(server.cfg.GreetingText) == "" {
			done <- nil
			return
		}
		_, err := server.greetingPCMFor(ctx)
		done <- err
	}()
	return done
}

func (server *Server) playThinking(ctx context.Context, session *CallSession) {
	if session == nil || strings.TrimSpace(server.cfg.ThinkingText) == "" {
		return
	}
	pcm, err := server.thinkingPCMFor(ctx)
	if err != nil {
		server.logger.Warn("failed to synthesize thinking prompt", "callId", session.CallID, "error", err)
		return
	}
	if len(pcm.Samples) == 0 {
		return
	}
	if err := server.sendPCM(ctx, session, pcm); err != nil {
		server.logger.Warn("failed to send thinking prompt", "callId", session.CallID, "error", err)
		return
	}
	server.logger.Info("thinking prompt sent", "callId", session.CallID)
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
	if err := waitForDuration(ctx, server.cfg.GreetingDelay); err != nil {
		return
	}
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
	return server.promptPCMFor(ctx, &server.greetingCache, server.cfg.GreetingText)
}

func (server *Server) thinkingPCMFor(ctx context.Context) (speech.PCMBuffer, error) {
	return server.promptPCMFor(ctx, &server.thinkingCache, server.cfg.ThinkingText)
}

func (server *Server) promptPCMFor(ctx context.Context, cache *pcmCache, text string) (speech.PCMBuffer, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return speech.PCMBuffer{}, nil
	}
	for {
		cache.mu.Lock()
		if cache.ready {
			pcm := clonePCM(cache.pcm)
			cache.mu.Unlock()
			return pcm, nil
		}
		if done := cache.done; done != nil {
			cache.mu.Unlock()
			select {
			case <-ctx.Done():
				return speech.PCMBuffer{}, ctx.Err()
			case <-done:
				continue
			}
		}
		done := make(chan struct{})
		cache.done = done
		cache.mu.Unlock()

		pcm, err := server.speechProvider.Synthesize(ctx, text, speech.SynthesisOptions{
			Locale: server.cfg.DefaultLocale,
			Voice:  server.cfg.Gemini.TTSVoice,
		})

		cache.mu.Lock()
		if err == nil && len(pcm.Samples) > 0 {
			cache.pcm = clonePCM(pcm)
			cache.ready = true
		}
		cache.done = nil
		close(done)
		cache.mu.Unlock()

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

func ringbackFrame(startSample int, frameSize int, sampleRate int) []int16 {
	frame := make([]int16, frameSize)
	if sampleRate <= 0 {
		return frame
	}
	toneSamples := sampleRate
	cycleSamples := sampleRate * 5
	for index := range frame {
		sampleIndex := startSample + index
		if sampleIndex%cycleSamples >= toneSamples {
			continue
		}
		angle := 2 * math.Pi * ringbackFrequencyHz * float64(sampleIndex) / float64(sampleRate)
		frame[index] = int16(ringbackAmplitude * math.Sin(angle))
	}
	return frame
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
	type transcribeResult struct {
		transcript speech.Transcript
		err        error
	}
	startedAt := time.Now()
	transcribed := make(chan transcribeResult, 1)
	go func() {
		transcript, err := server.speechProvider.Transcribe(ctx, speech.PCMBuffer{
			SampleRate: telephonyRate,
			Samples:    utterance,
		})
		transcribed <- transcribeResult{transcript: transcript, err: err}
	}()
	server.playThinking(ctx, session)
	var result transcribeResult
	select {
	case result = <-transcribed:
	case <-ctx.Done():
		return ctx.Err()
	}
	if result.err != nil {
		if sendErr := server.sendText(ctx, session, localizedPrompt(server.cfg.DefaultLocale, "repeat")); sendErr != nil {
			return fmt.Errorf("transcribe: %w; fallback: %v", result.err, sendErr)
		}
		return fmt.Errorf("transcribe: %w", result.err)
	}
	text := strings.TrimSpace(result.transcript.Text)
	if text == "" {
		return server.sendText(ctx, session, localizedPrompt(server.cfg.DefaultLocale, "repeat"))
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
			"transcriptConfidence": result.transcript.Confidence,
		},
	})
	if err != nil {
		if sendErr := server.sendText(ctx, session, localizedPrompt(server.cfg.DefaultLocale, "turn_error")); sendErr != nil {
			return fmt.Errorf("voice turn: %w; fallback: %v", err, sendErr)
		}
		return fmt.Errorf("voice turn: %w", err)
	}
	server.logger.Info(
		"voice turn completed",
		"callId", session.CallID,
		"status", response.Status,
		"durationMs", time.Since(turnStartedAt).Milliseconds(),
	)
	return server.sendText(ctx, session, turnReplyText(response, server.cfg.DefaultLocale))
}

func (server *Server) sendText(ctx context.Context, session *CallSession, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	options := speech.SynthesisOptions{
		Locale: server.cfg.DefaultLocale,
		Voice:  server.cfg.Gemini.TTSVoice,
	}
	if streamer, ok := server.speechProvider.(speech.StreamingProvider); ok {
		if err := server.sendTextStream(ctx, session, streamer, text, options); err == nil {
			return nil
		} else if !errors.Is(err, errNoStreamedAudio) {
			return err
		}
	}
	synthesisStartedAt := time.Now()
	pcm, err := server.speechProvider.Synthesize(ctx, text, options)
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

var errNoStreamedAudio = errors.New("no streamed audio")

func (server *Server) sendTextStream(ctx context.Context, session *CallSession, streamer speech.StreamingProvider, text string, options speech.SynthesisOptions) error {
	synthesisStartedAt := time.Now()
	chunks := 0
	samples := 0
	frames := 0
	telephonySamples := 0
	telephonyRate := telephonyRateForSession(session)
	pacer := newRTPFramePacer(rtpFrameDuration)
	err := streamer.SynthesizeStream(ctx, text, options, func(pcm speech.PCMBuffer) error {
		if len(pcm.Samples) == 0 {
			return nil
		}
		chunks++
		samples += len(pcm.Samples)
		if chunks == 1 {
			server.logger.Info(
				"assistant speech stream started",
				"callId", session.CallID,
				"firstChunkMs", time.Since(synthesisStartedAt).Milliseconds(),
				"sampleRate", pcm.SampleRate,
				"samples", len(pcm.Samples),
			)
		}
		conditioned := conditionPCMForSession(session, pcm)
		if len(conditioned) == 0 {
			return nil
		}
		sentFrames, err := server.sendPCMFramesWithPacer(ctx, session, conditioned, telephonyRate, pacer)
		frames += sentFrames
		telephonySamples += len(conditioned)
		return err
	})
	if err != nil {
		if chunks == 0 {
			server.logger.Warn(
				"assistant speech stream failed before audio; falling back to buffered synthesis",
				"callId", session.CallID,
				"durationMs", time.Since(synthesisStartedAt).Milliseconds(),
				"error", err,
			)
			return errNoStreamedAudio
		}
		return fmt.Errorf("stream synthesize: %w", err)
	}
	if chunks == 0 {
		return errNoStreamedAudio
	}
	server.logger.Info(
		"assistant speech stream completed",
		"callId", session.CallID,
		"durationMs", time.Since(synthesisStartedAt).Milliseconds(),
		"chunks", chunks,
		"samples", samples,
		"frames", frames,
		"audioDurationMs", durationMillis(telephonySamples, telephonyRate),
	)
	return nil
}

func turnReplyText(response turn.Response, locale string) string {
	if strings.EqualFold(strings.TrimSpace(response.Status), "handoff") {
		return localizedPrompt(locale, "no_answer")
	}
	reply := strings.TrimSpace(response.Reply)
	if reply == "" {
		return localizedPrompt(locale, "no_answer")
	}
	return reply
}

func localizedPrompt(locale string, key string) string {
	isGerman := strings.HasPrefix(strings.ToLower(strings.TrimSpace(locale)), "de")
	if isGerman {
		switch key {
		case "repeat":
			return "Entschuldigung, ich habe Sie nicht gut verstanden. Können Sie die Frage bitte kurz wiederholen?"
		case "turn_error":
			return "Entschuldigung, ich kann die freigegebenen Informationen gerade nicht abrufen. Ich gebe die Anfrage ans Team weiter."
		case "no_answer":
			return "Dazu habe ich keine freigegebene Information. Ich gebe die Anfrage ans Team weiter."
		}
	}
	switch key {
	case "repeat":
		return "Sorry, I did not hear that clearly. Could you please repeat the question?"
	case "turn_error":
		return "Sorry, I cannot access the approved business information right now. I will pass this to the team."
	case "no_answer":
		return "I do not have approved information for that. I will pass this to the team."
	default:
		return "I will pass this to the team."
	}
}

func (server *Server) sendPCM(ctx context.Context, session *CallSession, pcm speech.PCMBuffer) error {
	if len(pcm.Samples) == 0 {
		return nil
	}
	telephonyRate := telephonyRateForSession(session)
	samples := conditionPCMForSession(session, pcm)
	frames, err := server.sendPCMFrames(ctx, session, samples, telephonyRate)
	if err != nil {
		return err
	}
	server.logger.Info(
		"assistant speech sent",
		"callId", session.CallID,
		"frames", frames,
		"durationMs", durationMillis(len(samples), telephonyRate),
	)
	return nil
}

func (server *Server) sendPCMFrames(ctx context.Context, session *CallSession, samples []int16, telephonyRate int) (int, error) {
	return server.sendPCMFramesWithPacer(ctx, session, samples, telephonyRate, newRTPFramePacer(rtpFrameDuration))
}

func (server *Server) sendPCMFramesWithPacer(ctx context.Context, session *CallSession, samples []int16, telephonyRate int, pacer *rtpFramePacer) (int, error) {
	frameSize := telephonyRate / int(time.Second/rtpFrameDuration)
	if frameSize <= 0 {
		frameSize = 160
	}
	if pacer == nil {
		pacer = newRTPFramePacer(rtpFrameDuration)
	}
	frames := audio.FramePCM(samples, frameSize)
	for _, frame := range frames {
		if err := pacer.wait(ctx); err != nil {
			return 0, err
		}
		payload, err := audio.EncodeTelephonyPayload(session.Codec, frame)
		if err != nil {
			return 0, err
		}
		if err := session.RTP.SendPayload(payload); err != nil {
			return 0, err
		}
		pacer.markSent()
	}
	return len(frames), nil
}

func telephonyRateForSession(session *CallSession) int {
	if session != nil && session.Codec.ClockRate > 0 {
		return session.Codec.ClockRate
	}
	return 8000
}

func conditionPCMForSession(session *CallSession, pcm speech.PCMBuffer) []int16 {
	telephonyRate := telephonyRateForSession(session)
	sourceRate := pcm.SampleRate
	if sourceRate <= 0 {
		sourceRate = telephonyRate
	}
	return audio.ConditionForTelephony(pcm.Samples, sourceRate, telephonyRate)
}

type rtpFramePacer struct {
	interval time.Duration
	next     time.Time
}

func newRTPFramePacer(interval time.Duration) *rtpFramePacer {
	return &rtpFramePacer{interval: interval}
}

func (pacer *rtpFramePacer) wait(ctx context.Context) error {
	if pacer == nil || pacer.interval <= 0 {
		return nil
	}
	now := time.Now()
	if pacer.next.IsZero() || now.Sub(pacer.next) > pacer.interval {
		pacer.next = now
		return nil
	}
	if delay := time.Until(pacer.next); delay > 0 {
		return waitForDuration(ctx, delay)
	}
	return nil
}

func (pacer *rtpFramePacer) markSent() {
	if pacer == nil || pacer.interval <= 0 {
		return
	}
	if pacer.next.IsZero() {
		pacer.next = time.Now()
	}
	pacer.next = pacer.next.Add(pacer.interval)
}

func waitForDuration(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func waitForGreeting(ctx context.Context, ready <-chan error) error {
	if ready == nil {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-ready:
		return err
	}
}

func waitForMinimumAndGreeting(ctx context.Context, startedAt time.Time, minDuration time.Duration, ready <-chan error) error {
	remaining := minDuration - time.Since(startedAt)
	if remaining > 0 {
		if err := waitForDuration(ctx, remaining); err != nil {
			return err
		}
	}
	return waitForGreeting(ctx, ready)
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

// getSessionAndPhase returns the session pointer together with its Phase, both
// read under sessionsMu. Phase is written under the same lock (markSessionPhase),
// so reading it here — rather than dereferencing session.Phase afterwards —
// removes the data race on the call-teardown control path. Returns (nil, "")
// when the call id is unknown.
func (server *Server) getSessionAndPhase(callID string) (*CallSession, string) {
	server.sessionsMu.Lock()
	defer server.sessionsMu.Unlock()
	session := server.sessions[callID]
	if session == nil {
		return nil, ""
	}
	return session, session.Phase
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
