package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.HTTPAddr != ":4200" {
		t.Fatalf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.SIPBind != "0.0.0.0:5060" {
		t.Fatalf("SIPBind = %q", cfg.SIPBind)
	}
	if cfg.Easybell.Registrar != "voip.easybell.de" {
		t.Fatalf("registrar = %q", cfg.Easybell.Registrar)
	}
	if cfg.AnswerDelay != 5*time.Second {
		t.Fatalf("AnswerDelay = %s", cfg.AnswerDelay)
	}
	if cfg.GreetingText == "" {
		t.Fatal("GreetingText should have a default")
	}
	if cfg.Gemini.STTModel != "gemini-3.5-flash" {
		t.Fatalf("STTModel = %q", cfg.Gemini.STTModel)
	}
	if cfg.ReadinessError() == nil {
		t.Fatal("ReadinessError should report missing secrets")
	}
}

func TestReadinessErrorPassesWithRequiredConfig(t *testing.T) {
	env := map[string]string{
		"VOICE_EDGE_PUBLIC_IP":    "203.0.113.10",
		"EASYBELL_SIP_USERNAME":   "user",
		"EASYBELL_SIP_PASSWORD":   "password",
		"EASYBELL_PUBLIC_NUMBER":  "+49301234567",
		"VOICE_TURN_URL":          "https://voice.example.com/voice/turn",
		"VOICE_EDGE_SECRET":       "secret",
		"VOICE_EDGE_ASSISTANT_ID": "asst_5965790b88cc480b836f5eca",
		"GEMINI_API_KEY":          "gemini",
	}
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if err := cfg.ReadinessError(); err != nil {
		t.Fatalf("ReadinessError returned %v", err)
	}
}

func TestLoadGreetingConfig(t *testing.T) {
	env := map[string]string{
		"VOICE_EDGE_ANSWER_DELAY_MS": "1250",
		"VOICE_EDGE_GREETING_TEXT":   "Guten Tag.",
	}
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.AnswerDelay != 1250*time.Millisecond {
		t.Fatalf("AnswerDelay = %s", cfg.AnswerDelay)
	}
	if cfg.GreetingText != "Guten Tag." {
		t.Fatalf("GreetingText = %q", cfg.GreetingText)
	}
}
