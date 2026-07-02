package edge

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/media"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sdp"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sip"
)

const (
	registerExpiresSeconds = 300
	registerRefreshEvery   = 4 * time.Minute
	sipReadTimeout         = 500 * time.Millisecond
)

type Server struct {
	cfg               config.Config
	logger            *slog.Logger
	portPool          *media.PortPool
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
	Cancel      context.CancelFunc
	Phase       string
	StartedAt   time.Time
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
		server.markSessionPhase(message.Header("Call-ID"), "active")
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

	trying := sip.ResponseFor(request, 100, "Trying", "")
	server.sendMessage(trying, remote)

	assistantID, err := sip.UserFromURI(request.RequestURI())
	if err != nil {
		server.sendResponse(request, remote, 404, "Not Found", "")
		return
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
		Cancel:      cancel,
		Phase:       "ringing",
		StartedAt:   time.Now(),
	}
	server.storeSession(session)
	go func() {
		err := rtpSession.ReadLoop(callCtx, nil)
		if err != nil {
			server.logger.Warn("rtp read loop ended with error", "callId", callID, "error", err)
		}
	}()

	answer := sip.ResponseFor(request, 200, "OK", toTag)
	answer.SetHeader("Contact", server.contactHeader(assistantID))
	answer.SetHeader("Content-Type", "application/sdp")
	answer.Body = sdp.Answer(server.cfg.PublicIP, rtpSession.Port, codec)
	server.sendMessage(answer, remote)
	server.logger.Info(
		"accepted inbound invite",
		"callId", callID,
		"assistantId", assistantID,
		"codec", codec.Name,
		"rtpPort", rtpSession.Port,
	)
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
