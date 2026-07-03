package speech

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/audio"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
)

func TestGeminiProviderTranscribeSendsInlineAudio(t *testing.T) {
	var sawInlineAudio bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1beta/interactions":
			if r.Header.Get("x-goog-api-key") != "key" {
				t.Fatalf("api key header = %q", r.Header.Get("x-goog-api-key"))
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("ReadAll returned error: %v", err)
			}
			var request struct {
				Input []struct {
					Type     string `json:"type"`
					Data     string `json:"data"`
					MIMEType string `json:"mime_type"`
				} `json:"input"`
			}
			if err := json.Unmarshal(body, &request); err != nil {
				t.Fatalf("Unmarshal returned error: %v", err)
			}
			if len(request.Input) != 2 {
				t.Fatalf("len(input) = %d", len(request.Input))
			}
			audioInput := request.Input[1]
			if audioInput.Type != "audio" || audioInput.MIMEType != "audio/wav" {
				t.Fatalf("audio input = %#v", audioInput)
			}
			raw, err := base64.StdEncoding.DecodeString(audioInput.Data)
			if err != nil {
				t.Fatalf("DecodeString returned error: %v", err)
			}
			if len(raw) < 4 || string(raw[:4]) != "RIFF" {
				t.Fatalf("expected inline wav data, got %q", string(raw[:min(len(raw), 4)]))
			}
			sawInlineAudio = true
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"steps":[{"type":"model_output","content":[{"type":"text","text":"Hallo Welt"}]}]}`))
		default:
			t.Fatalf("unexpected request path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	provider := NewGeminiProvider(testGeminiConfig(), WithGeminiBaseURL(server.URL), WithGeminiHTTPClient(server.Client()))
	transcript, err := provider.Transcribe(context.Background(), PCMBuffer{
		SampleRate: 8000,
		Samples:    []int16{0, 1200, -1200, 0},
	})
	if err != nil {
		t.Fatalf("Transcribe returned error: %v", err)
	}
	if transcript.Text != "Hallo Welt" {
		t.Fatalf("transcript = %q", transcript.Text)
	}
	if !sawInlineAudio {
		t.Fatal("expected inline audio request")
	}
}

func TestGeminiProviderSynthesizeReturnsPCM(t *testing.T) {
	rawPCM := audio.PCM16ToLittleEndian([]int16{0, 1000, -1000})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/interactions" {
			t.Fatalf("unexpected request path %s", r.URL.Path)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"steps":[{"type":"model_output","content":[{"type":"audio","data":"` + base64.StdEncoding.EncodeToString(rawPCM) + `","mime_type":"audio/wav"}]}]}`))
	}))
	defer server.Close()

	provider := NewGeminiProvider(testGeminiConfig(), WithGeminiBaseURL(server.URL), WithGeminiHTTPClient(server.Client()))
	pcm, err := provider.Synthesize(context.Background(), "Hallo", SynthesisOptions{Locale: "de-DE", Voice: "Kore"})
	if err != nil {
		t.Fatalf("Synthesize returned error: %v", err)
	}
	if pcm.SampleRate != 24000 {
		t.Fatalf("SampleRate = %d", pcm.SampleRate)
	}
	if len(pcm.Samples) != 3 {
		t.Fatalf("len(Samples) = %d", len(pcm.Samples))
	}
}

func TestGeminiProviderSynthesizeStreamSendsPCMChunks(t *testing.T) {
	sawStream := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/interactions" {
			t.Fatalf("unexpected request path %s", r.URL.Path)
		}
		if r.Header.Get("Api-Revision") != "2026-05-20" {
			t.Fatalf("Api-Revision = %q", r.Header.Get("Api-Revision"))
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("ReadAll returned error: %v", err)
		}
		var request map[string]any
		if err := json.Unmarshal(body, &request); err != nil {
			t.Fatalf("Unmarshal returned error: %v", err)
		}
		if request["stream"] != true {
			t.Fatalf("stream = %#v", request["stream"])
		}
		sawStream = true
		w.Header().Set("content-type", "text/event-stream")
		writeStreamAudioEvent(t, w, []int16{0, 500})
		writeStreamAudioEvent(t, w, []int16{-500, 1000})
		_, _ = fmt.Fprint(w, "event: interaction.completed\ndata: {}\n\n")
	}))
	defer server.Close()

	provider := NewGeminiProvider(testGeminiConfig(), WithGeminiBaseURL(server.URL), WithGeminiHTTPClient(server.Client()))
	var chunks [][]int16
	err := provider.SynthesizeStream(context.Background(), "Hallo", SynthesisOptions{Locale: "de-DE", Voice: "Kore"}, func(pcm PCMBuffer) error {
		if pcm.SampleRate != 24000 {
			t.Fatalf("SampleRate = %d", pcm.SampleRate)
		}
		chunks = append(chunks, append([]int16(nil), pcm.Samples...))
		return nil
	})
	if err != nil {
		t.Fatalf("SynthesizeStream returned error: %v", err)
	}
	if !sawStream {
		t.Fatal("expected streaming request")
	}
	if len(chunks) != 2 {
		t.Fatalf("len(chunks) = %d", len(chunks))
	}
	if chunks[0][1] != 500 || chunks[1][0] != -500 {
		t.Fatalf("chunks = %#v", chunks)
	}
}

func writeStreamAudioEvent(t *testing.T, w http.ResponseWriter, samples []int16) {
	t.Helper()
	event, err := json.Marshal(map[string]any{
		"delta": map[string]any{
			"mime_type": "audio/l16",
			"data":      base64.StdEncoding.EncodeToString(audio.PCM16ToLittleEndian(samples)),
		},
	})
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	_, _ = fmt.Fprintf(w, "event: step.delta\ndata: %s\n\n", event)
}

func testGeminiConfig() config.GeminiConfig {
	return config.GeminiConfig{
		APIKey:   "key",
		STTModel: "gemini-3.5-flash",
		TTSModel: "gemini-3.1-flash-tts-preview",
		TTSVoice: "Kore",
	}
}
