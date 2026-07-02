package edge

import (
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sip"
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
