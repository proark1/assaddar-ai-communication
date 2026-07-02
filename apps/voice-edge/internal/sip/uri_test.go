package sip

import "testing"

func TestUserFromURI(t *testing.T) {
	user, err := UserFromURI("<sip:asst_123@voice-edge.assaddar.de>")
	if err != nil {
		t.Fatalf("UserFromURI returned error: %v", err)
	}
	if user != "asst_123" {
		t.Fatalf("user = %q", user)
	}
}
