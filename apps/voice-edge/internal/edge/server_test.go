package edge

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	edgeaudio "github.com/assaddar/ai-communication/apps/voice-edge/internal/audio"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/rtp"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sdp"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sip"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/speech"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/turn"
)

func TestResolveRegistrarAddsDefaultPort(t *testing.T) {
	addr, err := resolveRegistrar("127.0.0.1")
	if err != nil {
		t.Fatalf("resolveRegistrar returned error: %v", err)
	}
	if addr.Port != 5060 {
		t.Fatalf("port = %d", addr.Port)
	}
}

func TestHandleInviteRejectsUnsupportedCodec(t *testing.T) {
	server, err := New(testConfig(), nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP returned error: %v", err)
	}
	defer conn.Close()
	server.conn = conn

	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("client ListenUDP returned error: %v", err)
	}
	defer client.Close()

	body := "v=0\r\nc=IN IP4 198.51.100.2\r\nm=audio 40000 RTP/AVP 101\r\na=rtpmap:101 telephone-event/8000\r\n"
	raw := fmt.Sprintf("INVITE sip:asst_123@voice-edge.assaddar.de SIP/2.0\r\nVia: SIP/2.0/UDP client;branch=z9hG4bK\r\nFrom: <sip:+491701234567@example.com>;tag=caller\r\nTo: <sip:asst_123@voice-edge.assaddar.de>\r\nCall-ID: call\r\nCSeq: 1 INVITE\r\nContent-Length: %d\r\n\r\n%s", len(body), body)
	request, err := sip.ParseMessage(raw)
	if err != nil {
		t.Fatalf("ParseMessage returned error: %v", err)
	}
	server.handleInvite(testContext(t), request, client.LocalAddr().(*net.UDPAddr))

	responses := readSIPResponses(t, client, 2)
	joined := strings.Join(responses, "\n")
	if !strings.Contains(joined, "SIP/2.0 488 Not Acceptable Here") {
		t.Fatalf("expected 488 response, got:\n%s", joined)
	}
}

func TestHandleInviteAnswersAfterDelay(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 300 * time.Millisecond
	server, err := New(cfg, nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP returned error: %v", err)
	}
	defer conn.Close()
	server.conn = conn

	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("client ListenUDP returned error: %v", err)
	}
	defer client.Close()

	rtpReceiver, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("rtp ListenUDP returned error: %v", err)
	}
	defer rtpReceiver.Close()
	rtpPort := rtpReceiver.LocalAddr().(*net.UDPAddr).Port

	request := mustParseSIP(t, inviteRaw("call-delay", rtpPort, "8 PCMA/8000"))
	server.handleInvite(testContext(t), request, client.LocalAddr().(*net.UDPAddr))
	t.Cleanup(func() { server.endSession("call-delay") })

	immediate := strings.Join(readSIPResponses(t, client, 3), "\n")
	if !strings.Contains(immediate, "SIP/2.0 100 Trying") ||
		!strings.Contains(immediate, "SIP/2.0 180 Ringing") ||
		!strings.Contains(immediate, "SIP/2.0 183 Session Progress") {
		t.Fatalf("expected Trying, Ringing, and Session Progress before delayed answer, got:\n%s", immediate)
	}
	if !strings.Contains(immediate, "Content-Type: application/sdp") {
		t.Fatalf("expected early media SDP, got:\n%s", immediate)
	}
	if response, ok := readOptionalSIPResponse(t, client, 50*time.Millisecond); ok {
		t.Fatalf("received answer before delay elapsed:\n%s", response)
	}
	ringback := readRTPPacket(t, rtpReceiver, time.Second)
	if ringback.PayloadType != uint8(sdp.CodecPCMA.PayloadType) {
		t.Fatalf("ringback payload type = %d", ringback.PayloadType)
	}
	ringbackSamples, err := edgeaudio.DecodeTelephonyPayload(sdp.CodecPCMA, ringback.Payload)
	if err != nil {
		t.Fatalf("DecodeTelephonyPayload returned error: %v", err)
	}
	if !hasNonZeroSample(ringbackSamples) {
		t.Fatal("ringback RTP payload is silent")
	}
	delayed := strings.Join(readSIPResponses(t, client, 1), "\n")
	if !strings.Contains(delayed, "SIP/2.0 200 OK") {
		t.Fatalf("expected delayed 200 OK, got:\n%s", delayed)
	}
}

func TestAnswerWaitsForGreetingWarmupWhileRingbackContinues(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 100 * time.Millisecond
	cfg.GreetingDelay = 0
	cfg.GreetingText = "Hallo."
	server, err := New(cfg, nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	provider := &countingSpeechProvider{
		synthesis:      speech.PCMBuffer{SampleRate: 8000, Samples: testSamples(4000, 320)},
		synthesisDelay: 250 * time.Millisecond,
	}
	server.speechProvider = provider

	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP returned error: %v", err)
	}
	defer conn.Close()
	server.conn = conn

	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("client ListenUDP returned error: %v", err)
	}
	defer client.Close()

	rtpReceiver, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("rtp ListenUDP returned error: %v", err)
	}
	defer rtpReceiver.Close()
	rtpPort := rtpReceiver.LocalAddr().(*net.UDPAddr).Port

	request := mustParseSIP(t, inviteRaw("call-warmup", rtpPort, "8 PCMA/8000"))
	server.handleInvite(testContext(t), request, client.LocalAddr().(*net.UDPAddr))
	t.Cleanup(func() { server.endSession("call-warmup") })

	immediate := strings.Join(readSIPResponses(t, client, 3), "\n")
	if !strings.Contains(immediate, "SIP/2.0 183 Session Progress") {
		t.Fatalf("expected early media response, got:\n%s", immediate)
	}
	if response, ok := readOptionalSIPResponse(t, client, 150*time.Millisecond); ok {
		t.Fatalf("received answer before greeting warmup completed:\n%s", response)
	}
	_ = readRTPPacket(t, rtpReceiver, time.Second)
	delayed := strings.Join(readSIPResponses(t, client, 1), "\n")
	if !strings.Contains(delayed, "SIP/2.0 200 OK") {
		t.Fatalf("expected answer after greeting warmup, got:\n%s", delayed)
	}
}

func TestGreetingIsSentAfterACKWithoutInboundRTP(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 0
	cfg.GreetingDelay = 100 * time.Millisecond
	cfg.GreetingText = "Hallo."
	server, err := New(cfg, nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	provider := &countingSpeechProvider{
		synthesis: speech.PCMBuffer{SampleRate: 8000, Samples: testSamples(4000, 320)},
	}
	server.speechProvider = provider

	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP returned error: %v", err)
	}
	defer conn.Close()
	server.conn = conn

	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("client ListenUDP returned error: %v", err)
	}
	defer client.Close()

	rtpReceiver, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("rtp ListenUDP returned error: %v", err)
	}
	defer rtpReceiver.Close()
	rtpPort := rtpReceiver.LocalAddr().(*net.UDPAddr).Port

	request := mustParseSIP(t, inviteRaw("call-greeting", rtpPort, "8 PCMA/8000"))
	server.handleInvite(testContext(t), request, client.LocalAddr().(*net.UDPAddr))
	t.Cleanup(func() { server.endSession("call-greeting") })

	rawResponses := readSIPResponses(t, client, 3)
	responses := strings.Join(rawResponses, "\n")
	if !strings.Contains(responses, "SIP/2.0 200 OK") {
		t.Fatalf("expected 200 OK answer, got:\n%s", responses)
	}

	answer := mustParseSIP(t, rawResponses[len(rawResponses)-1])
	toTag := sip.HeaderParam(answer.Header("To"), "tag")
	if toTag == "" {
		t.Fatalf("expected 200 OK to include To tag, got:\n%s", rawResponses[len(rawResponses)-1])
	}
	ack := mustParseSIP(t, fmt.Sprintf("ACK sip:asst_123@voice-edge.assaddar.de SIP/2.0\r\nVia: SIP/2.0/UDP client;branch=z9hG4bK-ack\r\nFrom: <sip:+491701234567@example.com>;tag=caller\r\nTo: <sip:asst_123@voice-edge.assaddar.de>;tag=%s\r\nCall-ID: call-greeting\r\nCSeq: 1 ACK\r\nContent-Length: 0\r\n\r\n", toTag))
	server.handleMessage(testContext(t), ack, client.LocalAddr().(*net.UDPAddr))

	if packet, ok := readOptionalRTPPacket(t, rtpReceiver, 30*time.Millisecond); ok {
		t.Fatalf("received greeting RTP before greeting delay elapsed: %+v", packet)
	}
	packet := readRTPPacket(t, rtpReceiver, 2*time.Second)
	if packet.PayloadType != uint8(sdp.CodecPCMA.PayloadType) {
		t.Fatalf("payload type = %d", packet.PayloadType)
	}
	if got := provider.synthesizes.Load(); got == 0 {
		t.Fatal("Synthesize was not called for greeting")
	}
}

func TestProcessUtteranceSendsThinkingPromptAndTurnReply(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 0
	cfg.GreetingText = ""
	cfg.ThinkingText = "Einen Moment."
	server, session, rtpReceiver := setupProcessSession(t, cfg, "call-thinking")
	provider := &countingSpeechProvider{
		transcript: speech.Transcript{Text: "Was kostet das?"},
		synthesis:  speech.PCMBuffer{SampleRate: 8000, Samples: testSamples(4000, 320)},
	}
	server.speechProvider = provider
	fakeTurn := &fakeTurnSender{
		response: turn.Response{
			ConversationID: "conv",
			Reply:          "Das kann ich aus den freigegebenen Informationen beantworten.",
			Status:         "answered",
			Confidence:     0.9,
		},
	}
	server.turnClient = fakeTurn

	if err := server.processUtterance(testContext(t), session, testSamples(4000, 1600)); err != nil {
		t.Fatalf("processUtterance returned error: %v", err)
	}
	_ = readRTPPacket(t, rtpReceiver, time.Second)
	if got := provider.transcribes.Load(); got != 1 {
		t.Fatalf("transcribes = %d, want 1", got)
	}
	if got := provider.synthesizes.Load(); got < 2 {
		t.Fatalf("synthesizes = %d, want at least 2", got)
	}
	if got := fakeTurn.calls.Load(); got != 1 {
		t.Fatalf("turn calls = %d, want 1", got)
	}
}

func TestStreamingSpeechKeepsRTPPacingAcrossChunks(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 0
	cfg.GreetingText = ""
	server, session, rtpReceiver := setupProcessSession(t, cfg, "call-stream-paced")
	server.speechProvider = &streamingSpeechProvider{
		chunks: []speech.PCMBuffer{
			{SampleRate: 8000, Samples: testSamples(4000, 320)},
			{SampleRate: 8000, Samples: testSamples(4000, 320)},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	errs := make(chan error, 1)
	go func() {
		errs <- server.sendText(ctx, session, "Eine kurze Antwort.")
	}()

	receivedAt := make([]time.Time, 0, 4)
	for i := 0; i < 4; i++ {
		_, at := readRTPPacketAt(t, rtpReceiver, time.Second)
		receivedAt = append(receivedAt, at)
	}
	if err := <-errs; err != nil {
		t.Fatalf("sendText returned error: %v", err)
	}

	if gap := receivedAt[2].Sub(receivedAt[1]); gap < 10*time.Millisecond {
		t.Fatalf("chunk boundary RTP gap = %s, want paced packets", gap)
	}
}

func TestProcessUtteranceSendsAudibleFallbackOnTurnError(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 0
	cfg.GreetingText = ""
	cfg.ThinkingText = "Einen Moment."
	server, session, rtpReceiver := setupProcessSession(t, cfg, "call-turn-error")
	provider := &countingSpeechProvider{
		transcript: speech.Transcript{Text: "Was kostet das?"},
		synthesis:  speech.PCMBuffer{SampleRate: 8000, Samples: testSamples(4000, 320)},
	}
	server.speechProvider = provider
	server.turnClient = &fakeTurnSender{err: errors.New("temporary voice turn failure")}

	err := server.processUtterance(testContext(t), session, testSamples(4000, 1600))
	if err == nil {
		t.Fatal("processUtterance should return the voice turn error")
	}
	_ = readRTPPacket(t, rtpReceiver, time.Second)
	if got := provider.synthesizes.Load(); got < 2 {
		t.Fatalf("synthesizes = %d, want at least 2", got)
	}
}

func TestTurnReplyTextLocalizesHandoff(t *testing.T) {
	got := turnReplyText(turn.Response{
		Status: "handoff",
		Reply:  "I don't have that information in the approved business knowledge.",
	}, "de-DE")
	if strings.Contains(got, "approved business knowledge") {
		t.Fatalf("handoff reply was not localized: %q", got)
	}
	if !strings.Contains(got, "freigegebene Information") {
		t.Fatalf("handoff reply = %q, want approved-information fallback", got)
	}
}

func TestExpireUnackedSessionClosesAnsweredCall(t *testing.T) {
	cfg := testConfig()
	cfg.AnswerDelay = 0
	cfg.GreetingText = ""
	server, session, _ := setupProcessSession(t, cfg, "call-no-ack")

	server.expireUnackedSession(session.Context, session.CallID, 10*time.Millisecond)

	if got := server.getSession(session.CallID); got != nil {
		t.Fatal("expected unanswered call session to be closed")
	}
}

func TestHandleRTPPacketIgnoresInputWhileProcessing(t *testing.T) {
	server, err := New(testConfig(), nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	provider := &countingSpeechProvider{}
	server.speechProvider = provider

	session := &CallSession{
		CallID: "call",
		Codec:  sdp.CodecPCMA,
		VAD:    edgeaudio.NewTelephonyVAD(),
	}
	session.processing.Store(true)

	speechPayload, err := edgeaudio.EncodeTelephonyPayload(sdp.CodecPCMA, testSamples(8000, 160))
	if err != nil {
		t.Fatalf("EncodeTelephonyPayload returned error: %v", err)
	}
	speechPacket := rtp.Packet{PayloadType: uint8(sdp.CodecPCMA.PayloadType), Payload: speechPayload}
	for i := 0; i < 12; i++ {
		server.handleRTPPacket(testContext(t), session, speechPacket)
	}

	session.processing.Store(false)
	silencePayload, err := edgeaudio.EncodeTelephonyPayload(sdp.CodecPCMA, testSamples(0, 160))
	if err != nil {
		t.Fatalf("EncodeTelephonyPayload returned error: %v", err)
	}
	silencePacket := rtp.Packet{PayloadType: uint8(sdp.CodecPCMA.PayloadType), Payload: silencePayload}
	for i := 0; i < 40; i++ {
		server.handleRTPPacket(testContext(t), session, silencePacket)
	}
	time.Sleep(50 * time.Millisecond)

	if got := provider.transcribes.Load(); got != 0 {
		t.Fatalf("transcribes = %d, want 0", got)
	}
}

func testConfig() config.Config {
	return config.Config{
		PublicIP:      "127.0.0.1",
		SIPBind:       "127.0.0.1:5060",
		RTPPortMin:    32000,
		RTPPortMax:    32010,
		VoiceTurnURL:  "https://voice.example.com/voice/turn",
		VoiceSecret:   "secret",
		AssistantID:   "asst_5965790b88cc480b836f5eca",
		DefaultLocale: "de-DE",
		Easybell: config.EasybellConfig{
			Registrar:    "voip.easybell.de",
			Username:     "user",
			Password:     "password",
			FromDomain:   "voip.easybell.de",
			PublicNumber: "+49301234567",
		},
		Gemini: config.GeminiConfig{
			APIKey:   "gemini",
			STTModel: "gemini-3.5-flash",
			TTSModel: "gemini-3.1-flash-tts-preview",
			TTSVoice: "Kore",
		},
	}
}

type countingSpeechProvider struct {
	transcribes    atomic.Int32
	synthesizes    atomic.Int32
	transcript     speech.Transcript
	synthesis      speech.PCMBuffer
	synthesisDelay time.Duration
}

func (provider *countingSpeechProvider) Transcribe(context.Context, speech.PCMBuffer) (speech.Transcript, error) {
	provider.transcribes.Add(1)
	return provider.transcript, nil
}

func (provider *countingSpeechProvider) Synthesize(ctx context.Context, _ string, _ speech.SynthesisOptions) (speech.PCMBuffer, error) {
	provider.synthesizes.Add(1)
	if provider.synthesisDelay > 0 {
		select {
		case <-ctx.Done():
			return speech.PCMBuffer{}, ctx.Err()
		case <-time.After(provider.synthesisDelay):
		}
	}
	return clonePCM(provider.synthesis), nil
}

type streamingSpeechProvider struct {
	chunks []speech.PCMBuffer
}

func (provider *streamingSpeechProvider) Transcribe(context.Context, speech.PCMBuffer) (speech.Transcript, error) {
	return speech.Transcript{}, nil
}

func (provider *streamingSpeechProvider) Synthesize(context.Context, string, speech.SynthesisOptions) (speech.PCMBuffer, error) {
	if len(provider.chunks) == 0 {
		return speech.PCMBuffer{}, nil
	}
	return clonePCM(provider.chunks[0]), nil
}

func (provider *streamingSpeechProvider) SynthesizeStream(ctx context.Context, _ string, _ speech.SynthesisOptions, onChunk speech.PCMChunkHandler) error {
	for _, chunk := range provider.chunks {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if err := onChunk(clonePCM(chunk)); err != nil {
			return err
		}
	}
	return nil
}

type fakeTurnSender struct {
	calls    atomic.Int32
	response turn.Response
	err      error
}

func (sender *fakeTurnSender) Send(context.Context, string, turn.Request) (turn.Response, error) {
	sender.calls.Add(1)
	if sender.err != nil {
		return turn.Response{}, sender.err
	}
	return sender.response, nil
}

func setupProcessSession(t *testing.T, cfg config.Config, callID string) (*Server, *CallSession, *net.UDPConn) {
	t.Helper()
	server, err := New(cfg, nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP returned error: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	server.conn = conn

	client, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("client ListenUDP returned error: %v", err)
	}
	t.Cleanup(func() { client.Close() })

	rtpReceiver, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("rtp ListenUDP returned error: %v", err)
	}
	t.Cleanup(func() { rtpReceiver.Close() })

	request := mustParseSIP(t, inviteRaw(callID, rtpReceiver.LocalAddr().(*net.UDPAddr).Port, "8 PCMA/8000"))
	server.handleInvite(testContext(t), request, client.LocalAddr().(*net.UDPAddr))
	t.Cleanup(func() { server.endSession(callID) })
	responses := strings.Join(readSIPResponses(t, client, 3), "\n")
	if !strings.Contains(responses, "SIP/2.0 200 OK") {
		t.Fatalf("expected answered call, got:\n%s", responses)
	}
	session := server.getSession(callID)
	if session == nil {
		t.Fatal("session was not stored")
	}
	return server, session, rtpReceiver
}

func testSamples(value int16, count int) []int16 {
	samples := make([]int16, count)
	for i := range samples {
		samples[i] = value
	}
	return samples
}

func hasNonZeroSample(samples []int16) bool {
	for _, sample := range samples {
		if sample != 0 {
			return true
		}
	}
	return false
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	t.Cleanup(cancel)
	return ctx
}

func readSIPResponses(t *testing.T, conn *net.UDPConn, count int) []string {
	t.Helper()
	responses := make([]string, 0, count)
	buffer := make([]byte, 4096)
	for len(responses) < count {
		if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
			t.Fatalf("SetReadDeadline returned error: %v", err)
		}
		n, _, err := conn.ReadFromUDP(buffer)
		if err != nil {
			t.Fatalf("ReadFromUDP returned error: %v", err)
		}
		responses = append(responses, string(buffer[:n]))
	}
	return responses
}

func readOptionalSIPResponse(t *testing.T, conn *net.UDPConn, timeout time.Duration) (string, bool) {
	t.Helper()
	buffer := make([]byte, 4096)
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		t.Fatalf("SetReadDeadline returned error: %v", err)
	}
	n, _, err := conn.ReadFromUDP(buffer)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return "", false
		}
		t.Fatalf("ReadFromUDP returned error: %v", err)
	}
	return string(buffer[:n]), true
}

func readRTPPacket(t *testing.T, conn *net.UDPConn, timeout time.Duration) rtp.Packet {
	t.Helper()
	packet, ok := readOptionalRTPPacket(t, conn, timeout)
	if !ok {
		t.Fatalf("expected RTP packet within %s", timeout)
	}
	return packet
}

func readRTPPacketAt(t *testing.T, conn *net.UDPConn, timeout time.Duration) (rtp.Packet, time.Time) {
	t.Helper()
	packet, ok, receivedAt := readOptionalRTPPacketAt(t, conn, timeout)
	if !ok {
		t.Fatalf("expected RTP packet within %s", timeout)
	}
	return packet, receivedAt
}

func readOptionalRTPPacket(t *testing.T, conn *net.UDPConn, timeout time.Duration) (rtp.Packet, bool) {
	packet, ok, _ := readOptionalRTPPacketAt(t, conn, timeout)
	return packet, ok
}

func readOptionalRTPPacketAt(t *testing.T, conn *net.UDPConn, timeout time.Duration) (rtp.Packet, bool, time.Time) {
	t.Helper()
	buffer := make([]byte, 1500)
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		t.Fatalf("SetReadDeadline returned error: %v", err)
	}
	n, _, err := conn.ReadFromUDP(buffer)
	receivedAt := time.Now()
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return rtp.Packet{}, false, time.Time{}
		}
		t.Fatalf("ReadFromUDP returned error: %v", err)
	}
	packet, err := rtp.ParsePacket(buffer[:n])
	if err != nil {
		t.Fatalf("ParsePacket returned error: %v", err)
	}
	return packet, true, receivedAt
}

func mustParseSIP(t *testing.T, raw string) sip.Message {
	t.Helper()
	message, err := sip.ParseMessage(raw)
	if err != nil {
		t.Fatalf("ParseMessage returned error: %v", err)
	}
	return message
}

func inviteRaw(callID string, mediaPort int, rtpmap string) string {
	body := fmt.Sprintf("v=0\r\nc=IN IP4 127.0.0.1\r\nm=audio %d RTP/AVP %s\r\na=rtpmap:%s\r\n", mediaPort, strings.Fields(rtpmap)[0], rtpmap)
	return fmt.Sprintf("INVITE sip:asst_123@voice-edge.assaddar.de SIP/2.0\r\nVia: SIP/2.0/UDP client;branch=z9hG4bK\r\nFrom: <sip:+491701234567@example.com>;tag=caller\r\nTo: <sip:asst_123@voice-edge.assaddar.de>\r\nCall-ID: %s\r\nCSeq: 1 INVITE\r\nContent-Length: %d\r\n\r\n%s", callID, len(body), body)
}
