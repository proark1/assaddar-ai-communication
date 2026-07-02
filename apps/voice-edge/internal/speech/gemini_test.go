package speech

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/audio"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
)

func TestGeminiProviderTranscribeUploadsAudioAndDeletesFile(t *testing.T) {
	var startedUpload bool
	var finalizedUpload bool
	var deletedFile bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/upload/v1beta/files":
			startedUpload = true
			if r.URL.Query().Get("key") != "key" {
				t.Fatalf("key = %q", r.URL.Query().Get("key"))
			}
			if r.Header.Get("x-goog-upload-protocol") != "resumable" {
				t.Fatalf("upload protocol = %q", r.Header.Get("x-goog-upload-protocol"))
			}
			w.Header().Set("x-goog-upload-url", serverURL(t, r)+"/upload-session")
			w.WriteHeader(http.StatusOK)
		case "/upload-session":
			finalizedUpload = true
			if r.Header.Get("x-goog-upload-command") != "upload, finalize" {
				t.Fatalf("upload command = %q", r.Header.Get("x-goog-upload-command"))
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("ReadAll returned error: %v", err)
			}
			if !strings.HasPrefix(string(body), "RIFF") {
				t.Fatal("expected wav upload")
			}
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"file":{"name":"files/test-audio","uri":"gemini://files/test-audio","mimeType":"audio/wav"}}`))
		case "/v1beta/interactions":
			if r.Header.Get("x-goog-api-key") != "key" {
				t.Fatalf("api key header = %q", r.Header.Get("x-goog-api-key"))
			}
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"steps":[{"type":"model_output","content":[{"type":"text","text":"Hallo Welt"}]}]}`))
		case "/v1beta/files/test-audio":
			deletedFile = true
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{}`))
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
	if !startedUpload || !finalizedUpload || !deletedFile {
		t.Fatalf("upload/delete flags = %t/%t/%t", startedUpload, finalizedUpload, deletedFile)
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

func testGeminiConfig() config.GeminiConfig {
	return config.GeminiConfig{
		APIKey:   "key",
		STTModel: "gemini-3.5-flash",
		TTSModel: "gemini-3.1-flash-tts-preview",
		TTSVoice: "Kore",
	}
}

func serverURL(t *testing.T, r *http.Request) string {
	t.Helper()
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}
