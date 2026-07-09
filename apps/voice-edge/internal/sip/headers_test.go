package sip

import "testing"

func TestExtractUserFromHeader(t *testing.T) {
	user := ExtractUserFromHeader(`"Caller" <sip:+491701234567@example.com>;tag=abc`)
	if user != "+491701234567" {
		t.Fatalf("user = %q", user)
	}
}

func TestHeaderParamExtractsCaseInsensitiveQuotedValues(t *testing.T) {
	value := HeaderParam(`"Caller" <sip:+4917@example.com>;Tag="abc";transport=udp`, "tag")
	if value != "abc" {
		t.Fatalf("tag = %q", value)
	}
}
