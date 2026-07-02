package sip

import "testing"

func TestExtractUserFromHeader(t *testing.T) {
	user := ExtractUserFromHeader(`"Caller" <sip:+491701234567@example.com>;tag=abc`)
	if user != "+491701234567" {
		t.Fatalf("user = %q", user)
	}
}
