package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr              string
	PublicIP              string
	SIPBind               string
	RTPPortMin            int
	RTPPortMax            int
	AnswerDelay           time.Duration
	GreetingDelay         time.Duration
	GreetingText          string
	ThinkingText          string
	Easybell              EasybellConfig
	VoiceTurnURL          string
	VoiceSecret           string
	AssistantID           string
	Gemini                GeminiConfig
	DefaultLocale         string
	SIPAllowedSources     []net.IPNet
	SIPAllowedSourceHosts []string
	MaxSessions           int
	MaxCallDuration       time.Duration
	RTPInactivityTimeout  time.Duration
}

type EasybellConfig struct {
	Registrar    string
	Username     string
	Password     string
	FromDomain   string
	PublicNumber string
}

type GeminiConfig struct {
	APIKey   string
	STTModel string
	TTSModel string
	TTSVoice string
}

func LoadFromEnv() (Config, error) {
	return Load(os.Getenv)
}

func Load(getenv func(string) string) (Config, error) {
	httpPort := envDefault(getenv, "VOICE_EDGE_HTTP_PORT", "4200")
	cfg := Config{
		HTTPAddr:      ":" + httpPort,
		PublicIP:      strings.TrimSpace(getenv("VOICE_EDGE_PUBLIC_IP")),
		SIPBind:       envDefault(getenv, "VOICE_EDGE_SIP_BIND", "0.0.0.0:5060"),
		RTPPortMin:    envIntDefault(getenv, "VOICE_EDGE_RTP_PORT_MIN", 30000),
		RTPPortMax:    envIntDefault(getenv, "VOICE_EDGE_RTP_PORT_MAX", 30100),
		AnswerDelay:   time.Duration(envIntDefault(getenv, "VOICE_EDGE_ANSWER_DELAY_MS", 2000)) * time.Millisecond,
		GreetingDelay: time.Duration(envIntDefault(getenv, "VOICE_EDGE_GREETING_DELAY_MS", 1000)) * time.Millisecond,
		GreetingText:  envDefault(getenv, "VOICE_EDGE_GREETING_TEXT", "Hallo, hier ist der KI-Assistent von Assad Dar. Wie kann ich Ihnen helfen?"),
		ThinkingText:  envDefault(getenv, "VOICE_EDGE_THINKING_TEXT", "Einen Moment, ich schaue kurz nach."),
		VoiceTurnURL:  strings.TrimSpace(getenv("VOICE_TURN_URL")),
		VoiceSecret:   strings.TrimSpace(getenv("VOICE_EDGE_SECRET")),
		AssistantID:   strings.TrimSpace(getenv("VOICE_EDGE_ASSISTANT_ID")),
		Easybell: EasybellConfig{
			Registrar:    envDefault(getenv, "EASYBELL_SIP_REGISTRAR", "voip.easybell.de"),
			Username:     strings.TrimSpace(getenv("EASYBELL_SIP_USERNAME")),
			Password:     strings.TrimSpace(getenv("EASYBELL_SIP_PASSWORD")),
			FromDomain:   envDefault(getenv, "EASYBELL_SIP_FROM_DOMAIN", "voip.easybell.de"),
			PublicNumber: strings.TrimSpace(getenv("EASYBELL_PUBLIC_NUMBER")),
		},
		Gemini: GeminiConfig{
			APIKey:   strings.TrimSpace(getenv("GEMINI_API_KEY")),
			STTModel: envDefault(getenv, "GEMINI_STT_MODEL", "gemini-3.5-flash"),
			TTSModel: envDefault(getenv, "GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview"),
			TTSVoice: envDefault(getenv, "GEMINI_TTS_VOICE", "Kore"),
		},
		DefaultLocale:        envDefault(getenv, "VOICE_LOCALE", "de-DE"),
		MaxSessions:          envIntDefault(getenv, "VOICE_EDGE_MAX_SESSIONS", 0),
		MaxCallDuration:      time.Duration(envIntDefault(getenv, "VOICE_EDGE_MAX_CALL_DURATION_MS", 1800000)) * time.Millisecond,
		RTPInactivityTimeout: time.Duration(envIntDefault(getenv, "VOICE_EDGE_RTP_INACTIVITY_TIMEOUT_MS", 120000)) * time.Millisecond,
	}
	sources, sourceHosts, err := parseSIPAllowedSources(getenv("VOICE_EDGE_SIP_ALLOWED_SOURCES"))
	if err != nil {
		return Config{}, err
	}
	cfg.SIPAllowedSources = sources
	cfg.SIPAllowedSourceHosts = sourceHosts
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// parseSIPAllowedSources parses a comma-separated list of IPs, CIDRs, or hostnames.
// An empty value yields nil (SIP source filtering disabled — accept all). Bare
// IPs become a host-sized network (/32 for IPv4, /128 for IPv6).
func parseSIPAllowedSources(raw string) ([]net.IPNet, []string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil, nil
	}
	var networks []net.IPNet
	var hosts []string
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		entry = strings.TrimPrefix(entry, "sip:")
		if host, _, err := net.SplitHostPort(entry); err == nil {
			entry = host
		}
		if strings.Contains(entry, "/") {
			_, network, err := net.ParseCIDR(entry)
			if err != nil {
				return nil, nil, fmt.Errorf("VOICE_EDGE_SIP_ALLOWED_SOURCES: invalid CIDR %q: %w", entry, err)
			}
			networks = append(networks, *network)
			continue
		}
		ip := net.ParseIP(entry)
		if ip != nil {
			bits := 32
			if ip.To4() == nil {
				bits = 128
			}
			networks = append(networks, net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		entry = strings.TrimSuffix(strings.ToLower(entry), ".")
		if !isHostnameAllowlistEntry(entry) {
			return nil, nil, fmt.Errorf("VOICE_EDGE_SIP_ALLOWED_SOURCES: invalid source %q", entry)
		}
		hosts = append(hosts, entry)
	}
	return networks, hosts, nil
}

func isHostnameAllowlistEntry(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 {
			return false
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, ch := range label {
			if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' {
				continue
			}
			return false
		}
	}
	return true
}

func (cfg Config) Validate() error {
	if cfg.HTTPAddr == ":" {
		return errors.New("VOICE_EDGE_HTTP_PORT is required")
	}
	if _, _, err := net.SplitHostPort(cfg.SIPBind); err != nil {
		return fmt.Errorf("VOICE_EDGE_SIP_BIND must be host:port: %w", err)
	}
	if cfg.RTPPortMin < 1 || cfg.RTPPortMax < 1 || cfg.RTPPortMin > cfg.RTPPortMax {
		return errors.New("RTP port range must be positive and ordered")
	}
	if cfg.RTPPortMax-cfg.RTPPortMin < 1 {
		return errors.New("RTP port range must include at least two ports")
	}
	if cfg.AnswerDelay < 0 {
		return errors.New("VOICE_EDGE_ANSWER_DELAY_MS must be zero or positive")
	}
	if cfg.GreetingDelay < 0 {
		return errors.New("VOICE_EDGE_GREETING_DELAY_MS must be zero or positive")
	}
	if cfg.RTPInactivityTimeout < 0 {
		return errors.New("VOICE_EDGE_RTP_INACTIVITY_TIMEOUT_MS must be zero or positive")
	}
	if cfg.VoiceTurnURL != "" {
		parsed, err := url.Parse(cfg.VoiceTurnURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return errors.New("VOICE_TURN_URL must be an absolute URL")
		}
	}
	return nil
}

func (cfg Config) ReadinessError() error {
	missing := make([]string, 0)
	required := map[string]string{
		"VOICE_EDGE_PUBLIC_IP":    cfg.PublicIP,
		"EASYBELL_SIP_USERNAME":   cfg.Easybell.Username,
		"EASYBELL_SIP_PASSWORD":   cfg.Easybell.Password,
		"EASYBELL_PUBLIC_NUMBER":  cfg.Easybell.PublicNumber,
		"VOICE_TURN_URL":          cfg.VoiceTurnURL,
		"VOICE_EDGE_SECRET":       cfg.VoiceSecret,
		"VOICE_EDGE_ASSISTANT_ID": cfg.AssistantID,
		"GEMINI_API_KEY":          cfg.Gemini.APIKey,
	}
	for key, value := range required {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("missing required runtime config: %s", strings.Join(missing, ", "))
	}
	return nil
}

func envDefault(getenv func(string) string, key string, fallback string) string {
	value := strings.TrimSpace(getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envIntDefault(getenv func(string) string, key string, fallback int) int {
	value := strings.TrimSpace(getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
