package sip

import "strings"

func ExtractAddress(header string) string {
	header = strings.TrimSpace(header)
	if start := strings.Index(header, "<"); start >= 0 {
		if end := strings.Index(header[start:], ">"); end >= 0 {
			return header[start+1 : start+end]
		}
	}
	if semicolon := strings.Index(header, ";"); semicolon >= 0 {
		return strings.TrimSpace(header[:semicolon])
	}
	return header
}

func ExtractUserFromHeader(header string) string {
	user, err := UserFromURI(ExtractAddress(header))
	if err != nil {
		return ""
	}
	return user
}

func HeaderParam(header string, name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if header == "" || name == "" {
		return ""
	}
	parts := strings.Split(header, ";")
	for _, part := range parts[1:] {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok || !strings.EqualFold(strings.TrimSpace(key), name) {
			continue
		}
		return strings.Trim(strings.TrimSpace(value), `"`)
	}
	return ""
}
