package sip

import (
	"strings"
	"testing"
)

func TestParseMessage(t *testing.T) {
	raw := "INVITE sip:asst_123@voice-edge.assaddar.de SIP/2.0\r\nCall-ID: abc\r\nContent-Length: 3\r\n\r\nabcignored"
	msg, err := ParseMessage(raw)
	if err != nil {
		t.Fatalf("ParseMessage returned error: %v", err)
	}
	if msg.StartLine != "INVITE sip:asst_123@voice-edge.assaddar.de SIP/2.0" {
		t.Fatalf("StartLine = %q", msg.StartLine)
	}
	if msg.Header("call-id") != "abc" {
		t.Fatalf("Call-ID = %q", msg.Header("call-id"))
	}
	if msg.Body != "abc" {
		t.Fatalf("Body = %q", msg.Body)
	}
}

func TestMessageStringAddsContentLength(t *testing.T) {
	msg := NewResponse(200, "OK")
	msg.AddHeader("Via", "SIP/2.0/UDP client.example.com")
	msg.Body = "v=0"
	raw := msg.String()
	if !strings.Contains(raw, "Content-Length: 3\r\n") {
		t.Fatalf("serialized message missing content length:\n%s", raw)
	}
}
