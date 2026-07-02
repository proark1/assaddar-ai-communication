package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
)

const serviceName = "assaddar-voice-edge"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.LoadFromEnv()
	if err != nil {
		logger.Error("invalid voice edge configuration", "error", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", jsonHandler(func() (int, map[string]any) {
		return http.StatusOK, map[string]any{
			"ok":      true,
			"service": serviceName,
		}
	}))
	mux.HandleFunc("/ready", jsonHandler(func() (int, map[string]any) {
		if err := cfg.ReadinessError(); err != nil {
			return http.StatusServiceUnavailable, map[string]any{
				"ok":      false,
				"service": serviceName,
				"error":   err.Error(),
			}
		}
		return http.StatusOK, map[string]any{
			"ok":      true,
			"service": serviceName,
		}
	}))

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Info("starting voice edge", "httpAddr", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("voice edge stopped", "error", err)
		os.Exit(1)
	}
}

func jsonHandler(fn func() (int, map[string]any)) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		status, payload := fn()
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			slog.Error("failed to write json response", "error", err)
		}
	}
}
