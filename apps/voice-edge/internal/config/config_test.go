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
	if cfg.AnswerDelay != 2*time.Second {
		t.Fatalf("AnswerDelay = %s", cfg.AnswerDelay)
	}
	if cfg.GreetingDelay != time.Second {
		t.Fatalf("GreetingDelay = %s", cfg.GreetingDelay)
	}
	if cfg.GreetingText == "" {
		t.Fatal("GreetingText should have a default")
	}
	if cfg.ThinkingText == "" {
		t.Fatal("ThinkingText should have a default")
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
		"VOICE_EDGE_ANSWER_DELAY_MS":   "1250",
		"VOICE_EDGE_GREETING_DELAY_MS": "750",
		"VOICE_EDGE_GREETING_TEXT":     "Guten Tag.",
		"VOICE_EDGE_THINKING_TEXT":     "Einen Augenblick.",
	}
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.AnswerDelay != 1250*time.Millisecond {
		t.Fatalf("AnswerDelay = %s", cfg.AnswerDelay)
	}
	if cfg.GreetingDelay != 750*time.Millisecond {
		t.Fatalf("GreetingDelay = %s", cfg.GreetingDelay)
	}
	if cfg.GreetingText != "Guten Tag." {
		t.Fatalf("GreetingText = %q", cfg.GreetingText)
	}
	if cfg.ThinkingText != "Einen Augenblick." {
		t.Fatalf("ThinkingText = %q", cfg.ThinkingText)
	}
}

func TestLoadSIPAllowedSourcesSupportsHostnames(t *testing.T) {
	env := map[string]string{
		"VOICE_EDGE_SIP_ALLOWED_SOURCES": "192.0.2.10, 2001:db8::1, 198.51.100.0/24, voip.easybell.de, sip:pbx.easybell.de:5060",
	}
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(cfg.SIPAllowedSources) != 3 {
		t.Fatalf("SIPAllowedSources length = %d", len(cfg.SIPAllowedSources))
	}
	if len(cfg.SIPAllowedSourceHosts) != 2 {
		t.Fatalf("SIPAllowedSourceHosts length = %d", len(cfg.SIPAllowedSourceHosts))
	}
	if cfg.SIPAllowedSourceHosts[0] != "voip.easybell.de" {
		t.Fatalf("first source host = %q", cfg.SIPAllowedSourceHosts[0])
	}
	if cfg.SIPAllowedSourceHosts[1] != "pbx.easybell.de" {
		t.Fatalf("second source host = %q", cfg.SIPAllowedSourceHosts[1])
	}
}
