package turn

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSignBody(t *testing.T) {
	signature := SignBody("secret", []byte(`{"text":"hallo"}`), 1700000000)
	if signature != "sha256=610703c9fd79f5d14f8c70f65bd198b747d6419df4fa7a34e3d983b838ce94a4" {
		t.Fatalf("signature = %q", signature)
	}
}

func TestClientSendSignsRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("assistantId") != "asst_123" {
			t.Fatalf("assistantId = %q", r.URL.Query().Get("assistantId"))
		}
		if r.Header.Get("x-voice-edge-timestamp") != "1700000000" {
			t.Fatalf("timestamp = %q", r.Header.Get("x-voice-edge-timestamp"))
		}
		if r.Header.Get("x-voice-edge-signature") == "" {
			t.Fatal("missing signature")
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"conversationId":"conv","reply":"Hallo","status":"answered","confidence":0.9,"handoffRecommended":false}`))
	}))
	defer server.Close()

	client := Client{
		BaseURL: server.URL + "/voice/turn",
		Secret:  "secret",
		Now: func() time.Time {
			return time.Unix(1700000000, 0)
		},
	}
	response, err := client.Send(context.Background(), "asst_123", Request{
		Text:     "Hallo",
		Provider: "voice_edge",
	})
	if err != nil {
		t.Fatalf("Send returned error: %v", err)
	}
	if response.Reply != "Hallo" {
		t.Fatalf("Reply = %q", response.Reply)
	}
}
