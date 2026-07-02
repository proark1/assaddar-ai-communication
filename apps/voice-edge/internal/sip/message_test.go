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

func TestRequestAndResponseHelpers(t *testing.T) {
	request, err := ParseMessage("INVITE sip:asst_123@voice-edge.assaddar.de SIP/2.0\r\nVia: SIP/2.0/UDP client;branch=z9hG4bK\r\nFrom: <sip:+4917@example.com>;tag=caller\r\nTo: <sip:asst_123@voice-edge.assaddar.de>\r\nCall-ID: call\r\nCSeq: 1 INVITE\r\n\r\n")
	if err != nil {
		t.Fatalf("ParseMessage returned error: %v", err)
	}
	if request.Method() != "INVITE" {
		t.Fatalf("Method = %q", request.Method())
	}
	if request.RequestURI() != "sip:asst_123@voice-edge.assaddar.de" {
		t.Fatalf("RequestURI = %q", request.RequestURI())
	}
	response := ResponseFor(request, 200, "OK", "edge")
	if response.StatusCode() != 200 {
		t.Fatalf("StatusCode = %d", response.StatusCode())
	}
	if !strings.Contains(response.Header("To"), ";tag=edge") {
		t.Fatalf("To header = %q", response.Header("To"))
	}
	if response.Header("Call-ID") != "call" {
		t.Fatalf("Call-ID = %q", response.Header("Call-ID"))
	}
}
