package sip

import (
	"errors"
	"strings"
)

func UserFromURI(uri string) (string, error) {
	uri = strings.TrimSpace(uri)
	uri = strings.Trim(uri, "<>")
	if !strings.HasPrefix(strings.ToLower(uri), "sip:") {
		return "", errors.New("uri is not a sip uri")
	}
	withoutScheme := uri[len("sip:"):]
	user, _, ok := strings.Cut(withoutScheme, "@")
	if !ok || strings.TrimSpace(user) == "" {
		return "", errors.New("sip uri missing user")
	}
	return strings.TrimSpace(user), nil
}
