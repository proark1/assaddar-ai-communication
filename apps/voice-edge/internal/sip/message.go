package sip

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

type Header struct {
	Name  string
	Value string
}

type Message struct {
	StartLine string
	Headers   []Header
	Body      string
}

func (msg Message) IsResponse() bool {
	return strings.HasPrefix(msg.StartLine, "SIP/2.0 ")
}

func (msg Message) Method() string {
	if msg.IsResponse() {
		return ""
	}
	fields := strings.Fields(msg.StartLine)
	if len(fields) < 1 {
		return ""
	}
	return fields[0]
}

func (msg Message) RequestURI() string {
	if msg.IsResponse() {
		return ""
	}
	fields := strings.Fields(msg.StartLine)
	if len(fields) < 2 {
		return ""
	}
	return fields[1]
}

func (msg Message) StatusCode() int {
	if !msg.IsResponse() {
		return 0
	}
	fields := strings.Fields(msg.StartLine)
	if len(fields) < 2 {
		return 0
	}
	status, err := strconv.Atoi(fields[1])
	if err != nil {
		return 0
	}
	return status
}

func ParseMessage(raw string) (Message, error) {
	normalized := strings.ReplaceAll(raw, "\r\n", "\n")
	head, body, _ := strings.Cut(normalized, "\n\n")
	lines := strings.Split(head, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return Message{}, errors.New("sip message missing start line")
	}
	msg := Message{StartLine: strings.TrimRight(lines[0], "\r"), Body: body}
	for _, line := range lines[1:] {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			return Message{}, fmt.Errorf("invalid sip header line: %s", line)
		}
		msg.Headers = append(msg.Headers, Header{
			Name:  strings.TrimSpace(name),
			Value: strings.TrimSpace(value),
		})
	}
	if contentLength := msg.Header("Content-Length"); contentLength != "" {
		expected, err := strconv.Atoi(contentLength)
		if err == nil && expected <= len(msg.Body) {
			msg.Body = msg.Body[:expected]
		}
	}
	return msg, nil
}

func (msg Message) Header(name string) string {
	for _, header := range msg.Headers {
		if strings.EqualFold(header.Name, name) {
			return header.Value
		}
	}
	return ""
}

func (msg *Message) SetHeader(name string, value string) {
	for i, header := range msg.Headers {
		if strings.EqualFold(header.Name, name) {
			msg.Headers[i].Name = name
			msg.Headers[i].Value = value
			return
		}
	}
	msg.Headers = append(msg.Headers, Header{Name: name, Value: value})
}

func (msg *Message) AddHeader(name string, value string) {
	msg.Headers = append(msg.Headers, Header{Name: name, Value: value})
}

func (msg Message) String() string {
	msg.SetHeader("Content-Length", strconv.Itoa(len(msg.Body)))
	var builder strings.Builder
	builder.WriteString(msg.StartLine)
	builder.WriteString("\r\n")
	for _, header := range msg.Headers {
		builder.WriteString(header.Name)
		builder.WriteString(": ")
		builder.WriteString(header.Value)
		builder.WriteString("\r\n")
	}
	builder.WriteString("\r\n")
	builder.WriteString(msg.Body)
	return builder.String()
}

func NewRequest(method string, uri string) Message {
	return Message{StartLine: method + " " + uri + " SIP/2.0"}
}

func NewResponse(status int, reason string) Message {
	return Message{StartLine: fmt.Sprintf("SIP/2.0 %d %s", status, reason)}
}

func ResponseFor(request Message, status int, reason string, toTag string) Message {
	response := NewResponse(status, reason)
	copyHeaderIfPresent(&response, request, "Via")
	copyHeaderIfPresent(&response, request, "From")
	to := request.Header("To")
	if toTag != "" && to != "" && !strings.Contains(strings.ToLower(to), ";tag=") {
		to += ";tag=" + toTag
	}
	if to != "" {
		response.AddHeader("To", to)
	}
	copyHeaderIfPresent(&response, request, "Call-ID")
	copyHeaderIfPresent(&response, request, "CSeq")
	response.AddHeader("Server", "AssaddarVoiceEdge/0.1")
	return response
}

func copyHeaderIfPresent(target *Message, source Message, name string) {
	value := source.Header(name)
	if value != "" {
		target.AddHeader(name, value)
	}
}
