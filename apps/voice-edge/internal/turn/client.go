package turn

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string
	Secret     string
	HTTPClient *http.Client
	Now        func() time.Time
}

type Request struct {
	Text      string         `json:"text"`
	CallID    string         `json:"callId,omitempty"`
	From      string         `json:"from,omitempty"`
	To        string         `json:"to,omitempty"`
	Provider  string         `json:"provider"`
	Locale    string         `json:"locale,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

type Response struct {
	ConversationID      string  `json:"conversationId"`
	Reply               string  `json:"reply"`
	Status              string  `json:"status"`
	Confidence          float64 `json:"confidence"`
	HandoffRecommended  bool    `json:"handoffRecommended"`
	TransferPhoneNumber *string `json:"transferPhoneNumber"`
}

func (client Client) Send(ctx context.Context, assistantID string, payload Request) (Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return Response{}, err
	}
	endpoint, err := withAssistantID(client.BaseURL, assistantID)
	if err != nil {
		return Response{}, err
	}
	timestamp := time.Now()
	if client.Now != nil {
		timestamp = client.Now()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-voice-edge-timestamp", strconv.FormatInt(timestamp.Unix(), 10))
	req.Header.Set("x-voice-edge-signature", SignBody(client.Secret, body, timestamp.Unix()))

	httpClient := client.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return Response{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Response{}, fmt.Errorf("voice turn returned %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	var parsed Response
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return Response{}, err
	}
	return parsed, nil
}

func SignBody(secret string, body []byte, timestamp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func withAssistantID(baseURL string, assistantID string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("assistantId", assistantID)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}
