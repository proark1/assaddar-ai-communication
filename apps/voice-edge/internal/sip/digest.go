package sip

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"strings"
)

type DigestChallenge struct {
	Realm     string
	Nonce     string
	Opaque    string
	Algorithm string
	Qop       string
}

func ParseDigestChallenge(header string) DigestChallenge {
	header = strings.TrimSpace(header)
	header = strings.TrimPrefix(header, "Digest")
	values := parseAuthParams(header)
	return DigestChallenge{
		Realm:     values["realm"],
		Nonce:     values["nonce"],
		Opaque:    values["opaque"],
		Algorithm: envDefault(values["algorithm"], "MD5"),
		Qop:       firstQop(values["qop"]),
	}
}

func DigestAuthorization(username string, password string, method string, uri string, challenge DigestChallenge, cnonce string, nonceCount string) string {
	qop := challenge.Qop
	algorithm := envDefault(challenge.Algorithm, "MD5")
	ha1 := md5Hex(username + ":" + challenge.Realm + ":" + password)
	ha2 := md5Hex(method + ":" + uri)
	var response string
	if qop != "" {
		response = md5Hex(ha1 + ":" + challenge.Nonce + ":" + nonceCount + ":" + cnonce + ":" + qop + ":" + ha2)
	} else {
		response = md5Hex(ha1 + ":" + challenge.Nonce + ":" + ha2)
	}

	parts := []string{
		fmt.Sprintf(`Digest username="%s"`, username),
		fmt.Sprintf(`realm="%s"`, challenge.Realm),
		fmt.Sprintf(`nonce="%s"`, challenge.Nonce),
		fmt.Sprintf(`uri="%s"`, uri),
		fmt.Sprintf(`algorithm=%s`, algorithm),
		fmt.Sprintf(`response="%s"`, response),
	}
	if challenge.Opaque != "" {
		parts = append(parts, fmt.Sprintf(`opaque="%s"`, challenge.Opaque))
	}
	if qop != "" {
		parts = append(parts,
			fmt.Sprintf("qop=%s", qop),
			fmt.Sprintf("nc=%s", nonceCount),
			fmt.Sprintf(`cnonce="%s"`, cnonce),
		)
	}
	return strings.Join(parts, ", ")
}

func md5Hex(value string) string {
	sum := md5.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}

func parseAuthParams(value string) map[string]string {
	out := map[string]string{}
	for _, part := range splitCommaAware(value) {
		key, raw, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		out[strings.ToLower(strings.TrimSpace(key))] = strings.Trim(strings.TrimSpace(raw), `"`)
	}
	return out
}

func splitCommaAware(value string) []string {
	var out []string
	start := 0
	inQuote := false
	for i, char := range value {
		switch char {
		case '"':
			inQuote = !inQuote
		case ',':
			if !inQuote {
				out = append(out, value[start:i])
				start = i + 1
			}
		}
	}
	out = append(out, value[start:])
	return out
}

func firstQop(value string) string {
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item == "auth" {
			return item
		}
	}
	return strings.TrimSpace(value)
}

func envDefault(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
