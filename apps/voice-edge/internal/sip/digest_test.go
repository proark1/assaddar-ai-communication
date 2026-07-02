package sip

import (
	"strings"
	"testing"
)

func TestDigestAuthorizationRFCExample(t *testing.T) {
	challenge := DigestChallenge{
		Realm:     "testrealm@host.com",
		Nonce:     "dcd98b7102dd2f0e8b11d0f600bfb0c093",
		Algorithm: "MD5",
		Qop:       "auth",
	}
	header := DigestAuthorization(
		"Mufasa",
		"Circle Of Life",
		"GET",
		"/dir/index.html",
		challenge,
		"0a4f113b",
		"00000001",
	)
	if !strings.Contains(header, `response="6629fae49393a05397450978507c4ef1"`) {
		t.Fatalf("unexpected digest header: %s", header)
	}
}

func TestParseDigestChallenge(t *testing.T) {
	challenge := ParseDigestChallenge(`Digest realm="easybell", nonce="abc", qop="auth,auth-int", opaque="xyz"`)
	if challenge.Realm != "easybell" ||
		challenge.Nonce != "abc" ||
		challenge.Qop != "auth" ||
		challenge.Opaque != "xyz" {
		t.Fatalf("challenge = %+v", challenge)
	}
}
