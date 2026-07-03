package speech

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/audio"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
)

const (
	geminiBaseURL      = "https://generativelanguage.googleapis.com"
	geminiAudioMIME    = "audio/wav"
	geminiInputRateHz  = 16000
	geminiOutputRateHz = 24000
)

type GeminiProvider struct {
	apiKey     string
	sttModel   string
	ttsModel   string
	ttsVoice   string
	baseURL    string
	httpClient *http.Client
}

type GeminiOption func(*GeminiProvider)

func WithGeminiHTTPClient(client *http.Client) GeminiOption {
	return func(provider *GeminiProvider) {
		if client != nil {
			provider.httpClient = client
		}
	}
}

func WithGeminiBaseURL(baseURL string) GeminiOption {
	return func(provider *GeminiProvider) {
		if strings.TrimSpace(baseURL) != "" {
			provider.baseURL = strings.TrimRight(baseURL, "/")
		}
	}
}

func NewGeminiProvider(cfg config.GeminiConfig, options ...GeminiOption) *GeminiProvider {
	provider := &GeminiProvider{
		apiKey:   strings.TrimSpace(cfg.APIKey),
		sttModel: strings.TrimSpace(cfg.STTModel),
		ttsModel: strings.TrimSpace(cfg.TTSModel),
		ttsVoice: strings.TrimSpace(cfg.TTSVoice),
		baseURL:  geminiBaseURL,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
	for _, option := range options {
		option(provider)
	}
	return provider
}

func (provider *GeminiProvider) Transcribe(ctx context.Context, pcm PCMBuffer) (Transcript, error) {
	if err := provider.validate(); err != nil {
		return Transcript{}, err
	}
	if len(pcm.Samples) == 0 {
		return Transcript{}, nil
	}
	samples := pcm.Samples
	if pcm.SampleRate != geminiInputRateHz {
		samples = audio.ResampleLinear(samples, pcm.SampleRate, geminiInputRateHz)
	}
	file, err := provider.uploadAudio(ctx, audio.EncodeWAVPCM16(samples, geminiInputRateHz), geminiAudioMIME, "assaddar-utterance.wav")
	if err != nil {
		return Transcript{}, err
	}
	defer provider.deleteFileSoon(file.Name)

	request := map[string]any{
		"model": provider.sttModel,
		"input": []map[string]any{
			{
				"type": "text",
				"text": "Transcribe the caller audio. Return only the exact spoken words in the same language. If there is no clear speech, return an empty string.",
			},
			{
				"type":      "audio",
				"uri":       file.URI,
				"mime_type": file.MIMETypeOr(geminiAudioMIME),
			},
		},
		"generation_config": map[string]any{
			"temperature":       0,
			"max_output_tokens": 256,
		},
	}
	var response interactionResponse
	if err := provider.postInteraction(ctx, request, &response); err != nil {
		return Transcript{}, err
	}
	return Transcript{Text: normalizeModelText(response.Text())}, nil
}

func (provider *GeminiProvider) Synthesize(ctx context.Context, text string, options SynthesisOptions) (PCMBuffer, error) {
	if err := provider.validate(); err != nil {
		return PCMBuffer{}, err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return PCMBuffer{}, nil
	}
	request := provider.ttsRequest(text, options)
	var response interactionResponse
	if err := provider.postInteraction(ctx, request, &response); err != nil {
		return PCMBuffer{}, err
	}
	encoded, err := response.AudioData()
	if err != nil {
		return PCMBuffer{}, err
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return PCMBuffer{}, fmt.Errorf("decode gemini audio: %w", err)
	}
	samples, sampleRate, err := audio.DecodeWAVPCM16(raw)
	if err != nil {
		return PCMBuffer{}, fmt.Errorf("decode gemini wav audio: %w", err)
	}
	if sampleRate == 0 {
		sampleRate = geminiOutputRateHz
	}
	return PCMBuffer{SampleRate: sampleRate, Samples: samples}, nil
}

func (provider *GeminiProvider) SynthesizeStream(ctx context.Context, text string, options SynthesisOptions, onChunk PCMChunkHandler) error {
	if onChunk == nil {
		return errors.New("synthesis stream handler is required")
	}
	if err := provider.validate(); err != nil {
		return err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	request := provider.ttsRequest(text, options)
	request["stream"] = true
	body, err := json.Marshal(request)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.endpoint("/v1beta/interactions"), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-goog-api-key", provider.apiKey)
	req.Header.Set("Api-Revision", "2026-05-20")
	resp, err := provider.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := checkResponse(resp); err != nil {
		return err
	}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	chunks := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		pcm, ok, err := decodeStreamAudioPayload(payload)
		if err != nil {
			return err
		}
		if !ok || len(pcm.Samples) == 0 {
			continue
		}
		chunks++
		if err := onChunk(pcm); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if chunks == 0 {
		return errors.New("gemini stream returned no audio data")
	}
	return nil
}

func (provider *GeminiProvider) ttsRequest(text string, options SynthesisOptions) map[string]any {
	voice := strings.TrimSpace(options.Voice)
	if voice == "" {
		voice = provider.ttsVoice
	}
	speechConfig := map[string]any{"voice": voice}
	if strings.TrimSpace(options.Locale) != "" {
		speechConfig["language"] = options.Locale
	}
	return map[string]any{
		"model": provider.ttsModel,
		"input": fmt.Sprintf("Read this naturally for a phone call in %s. Say only this text:\n\n%s", localeOrDefault(options.Locale), text),
		"response_format": map[string]any{
			"type": "audio",
		},
		"generation_config": map[string]any{
			"speech_config": []map[string]any{speechConfig},
		},
	}
}

func (provider *GeminiProvider) validate() error {
	if strings.TrimSpace(provider.apiKey) == "" {
		return errors.New("GEMINI_API_KEY is required")
	}
	if strings.TrimSpace(provider.sttModel) == "" {
		return errors.New("GEMINI_STT_MODEL is required")
	}
	if strings.TrimSpace(provider.ttsModel) == "" {
		return errors.New("GEMINI_TTS_MODEL is required")
	}
	return nil
}

func (provider *GeminiProvider) postInteraction(ctx context.Context, payload any, target any) error {
	endpoint := provider.endpoint("/v1beta/interactions")
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-goog-api-key", provider.apiKey)
	return provider.doJSON(req, target)
}

func (provider *GeminiProvider) uploadAudio(ctx context.Context, data []byte, mimeType string, displayName string) (geminiFile, error) {
	startPayload, err := json.Marshal(map[string]any{
		"file": map[string]any{
			"display_name": displayName,
		},
	})
	if err != nil {
		return geminiFile{}, err
	}
	startURL := provider.endpoint("/upload/v1beta/files") + "?key=" + url.QueryEscape(provider.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, startURL, bytes.NewReader(startPayload))
	if err != nil {
		return geminiFile{}, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-goog-upload-protocol", "resumable")
	req.Header.Set("x-goog-upload-command", "start")
	req.Header.Set("x-goog-upload-header-content-length", fmt.Sprintf("%d", len(data)))
	req.Header.Set("x-goog-upload-header-content-type", mimeType)

	resp, err := provider.httpClient.Do(req)
	if err != nil {
		return geminiFile{}, err
	}
	defer resp.Body.Close()
	if err := checkResponse(resp); err != nil {
		return geminiFile{}, err
	}
	uploadURL := strings.TrimSpace(resp.Header.Get("x-goog-upload-url"))
	if uploadURL == "" {
		return geminiFile{}, errors.New("gemini upload did not return x-goog-upload-url")
	}
	return provider.finalizeUpload(ctx, uploadURL, data)
}

func (provider *GeminiProvider) finalizeUpload(ctx context.Context, uploadURL string, data []byte) (geminiFile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(data))
	if err != nil {
		return geminiFile{}, err
	}
	req.Header.Set("content-length", fmt.Sprintf("%d", len(data)))
	req.Header.Set("x-goog-upload-offset", "0")
	req.Header.Set("x-goog-upload-command", "upload, finalize")
	req.Header.Set("content-type", geminiAudioMIME)
	var response fileUploadResponse
	if err := provider.doJSON(req, &response); err != nil {
		return geminiFile{}, err
	}
	if strings.TrimSpace(response.File.URI) == "" {
		return geminiFile{}, errors.New("gemini upload response missing file uri")
	}
	return response.File, nil
}

func (provider *GeminiProvider) deleteFileSoon(name string) {
	if strings.TrimSpace(name) == "" {
		return
	}
	cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = provider.deleteFile(cleanupCtx, name)
}

func (provider *GeminiProvider) deleteFile(ctx context.Context, name string) error {
	endpoint := provider.endpoint("/v1beta/"+strings.TrimPrefix(name, "/")) + "?key=" + url.QueryEscape(provider.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := provider.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return checkResponse(resp)
}

func (provider *GeminiProvider) doJSON(req *http.Request, target any) error {
	resp, err := provider.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := checkResponse(resp); err != nil {
		return err
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func (provider *GeminiProvider) endpoint(path string) string {
	return strings.TrimRight(provider.baseURL, "/") + path
}

func checkResponse(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("gemini returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
}

type fileUploadResponse struct {
	File geminiFile `json:"file"`
}

type geminiFile struct {
	Name         string `json:"name"`
	URI          string `json:"uri"`
	MIMEType     string `json:"mimeType"`
	MIMETypeJSON string `json:"mime_type"`
}

func (file geminiFile) MIMETypeOr(fallback string) string {
	if strings.TrimSpace(file.MIMEType) != "" {
		return file.MIMEType
	}
	if strings.TrimSpace(file.MIMETypeJSON) != "" {
		return file.MIMETypeJSON
	}
	return fallback
}

type interactionResponse struct {
	OutputText       string          `json:"output_text"`
	OutputTextCamel  string          `json:"outputText"`
	OutputAudio      *contentBlock   `json:"output_audio"`
	OutputAudioCamel *contentBlock   `json:"outputAudio"`
	Steps            []responseStep  `json:"steps"`
	Outputs          []contentBlock  `json:"outputs"`
	Raw              json.RawMessage `json:"-"`
}

type responseStep struct {
	Type    string         `json:"type"`
	Content []contentBlock `json:"content"`
}

type contentBlock struct {
	Type         string `json:"type"`
	Text         string `json:"text"`
	Data         string `json:"data"`
	MIMEType     string `json:"mimeType"`
	MIMETypeJSON string `json:"mime_type"`
	InlineData   *struct {
		Data string `json:"data"`
	} `json:"inline_data"`
	InlineDataCam *struct {
		Data string `json:"data"`
	} `json:"inlineData"`
}

type streamAudioEvent struct {
	Delta *streamAudioDelta `json:"delta"`
}

type streamAudioDelta struct {
	Data         string `json:"data"`
	MIMEType     string `json:"mimeType"`
	MIMETypeJSON string `json:"mime_type"`
	InlineData   *struct {
		Data string `json:"data"`
	} `json:"inline_data"`
	InlineDataCam *struct {
		Data string `json:"data"`
	} `json:"inlineData"`
}

func (response interactionResponse) Text() string {
	if strings.TrimSpace(response.OutputText) != "" {
		return response.OutputText
	}
	if strings.TrimSpace(response.OutputTextCamel) != "" {
		return response.OutputTextCamel
	}
	parts := make([]string, 0)
	for _, step := range response.Steps {
		for _, block := range step.Content {
			if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
				parts = append(parts, block.Text)
			}
		}
	}
	for _, block := range response.Outputs {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			parts = append(parts, block.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func (response interactionResponse) AudioData() (string, error) {
	for _, block := range []*contentBlock{response.OutputAudio, response.OutputAudioCamel} {
		if block != nil && strings.TrimSpace(block.Data) != "" {
			return block.Data, nil
		}
	}
	for _, step := range response.Steps {
		for _, block := range step.Content {
			if data := block.audioData(); data != "" {
				return data, nil
			}
		}
	}
	for _, block := range response.Outputs {
		if data := block.audioData(); data != "" {
			return data, nil
		}
	}
	return "", errors.New("gemini response missing audio data")
}

func (block contentBlock) audioData() string {
	if block.Type == "audio" && strings.TrimSpace(block.Data) != "" {
		return block.Data
	}
	if block.InlineData != nil && strings.TrimSpace(block.InlineData.Data) != "" {
		return block.InlineData.Data
	}
	if block.InlineDataCam != nil && strings.TrimSpace(block.InlineDataCam.Data) != "" {
		return block.InlineDataCam.Data
	}
	return ""
}

func decodeStreamAudioPayload(payload string) (PCMBuffer, bool, error) {
	var event streamAudioEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return PCMBuffer{}, false, fmt.Errorf("decode gemini stream event: %w", err)
	}
	if event.Delta == nil {
		return PCMBuffer{}, false, nil
	}
	encoded := event.Delta.audioData()
	if encoded == "" {
		return PCMBuffer{}, false, nil
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return PCMBuffer{}, false, fmt.Errorf("decode gemini stream audio: %w", err)
	}
	mimeType := strings.ToLower(event.Delta.mimeType())
	if strings.Contains(mimeType, "wav") {
		samples, sampleRate, err := audio.DecodeWAVPCM16(raw)
		if err != nil {
			return PCMBuffer{}, false, fmt.Errorf("decode gemini stream wav audio: %w", err)
		}
		if sampleRate == 0 {
			sampleRate = geminiOutputRateHz
		}
		return PCMBuffer{SampleRate: sampleRate, Samples: samples}, true, nil
	}
	return PCMBuffer{SampleRate: geminiOutputRateHz, Samples: audio.LittleEndianToPCM16(raw)}, true, nil
}

func (delta streamAudioDelta) audioData() string {
	if strings.TrimSpace(delta.Data) != "" {
		return delta.Data
	}
	if delta.InlineData != nil && strings.TrimSpace(delta.InlineData.Data) != "" {
		return delta.InlineData.Data
	}
	if delta.InlineDataCam != nil && strings.TrimSpace(delta.InlineDataCam.Data) != "" {
		return delta.InlineDataCam.Data
	}
	return ""
}

func (delta streamAudioDelta) mimeType() string {
	if strings.TrimSpace(delta.MIMEType) != "" {
		return delta.MIMEType
	}
	return delta.MIMETypeJSON
}

func normalizeModelText(text string) string {
	text = strings.TrimSpace(text)
	text = strings.Trim(text, "\"")
	text = strings.TrimSpace(text)
	if strings.EqualFold(text, "[silence]") || strings.EqualFold(text, "silence") {
		return ""
	}
	return text
}

func localeOrDefault(locale string) string {
	if strings.TrimSpace(locale) == "" {
		return "de-DE"
	}
	return locale
}
