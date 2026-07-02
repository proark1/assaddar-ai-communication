package sip

import (
	"strings"
	"testing"
)

func TestBuildRegisterRequest(t *testing.T) {
	msg := BuildRegisterRequest(RegisterOptions{
		Registrar:   "voip.easybell.de",
		Username:    "user",
		FromDomain:  "voip.easybell.de",
		ContactHost: "203.0.113.10",
		ContactPort: 5060,
		CallID:      "call-id",
		CSeq:        1,
		Branch:      "z9hG4bK-test",
		Expires:     300,
	}, `Digest username="user"`)
	raw := msg.String()
	if !strings.HasPrefix(raw, "REGISTER sip:voip.easybell.de SIP/2.0") {
		t.Fatalf("unexpected start line:\n%s", raw)
	}
	if !strings.Contains(raw, "Authorization: Digest username=\"user\"") {
		t.Fatalf("missing authorization:\n%s", raw)
	}
	if !strings.Contains(raw, "Contact: <sip:user@203.0.113.10:5060>") {
		t.Fatalf("missing contact:\n%s", raw)
	}
}
