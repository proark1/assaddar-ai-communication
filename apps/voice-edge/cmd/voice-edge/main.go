package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/config"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/edge"
)

const serviceName = "assaddar-voice-edge"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.LoadFromEnv()
	if err != nil {
		logger.Error("invalid voice edge configuration", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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

	if err := cfg.ReadinessError(); err != nil {
		logger.Warn("sip runtime is not starting because runtime config is incomplete", "error", err)
	} else {
		edgeServer, err := edge.New(cfg, logger)
		if err != nil {
			logger.Error("failed to initialize sip edge", "error", err)
			os.Exit(1)
		}
		go func() {
			logger.Info("starting sip edge", "sipBind", cfg.SIPBind)
			if err := edgeServer.Start(ctx); err != nil {
				logger.Error("sip edge stopped", "error", err)
				stop()
			}
		}()
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Warn("http server shutdown failed", "error", err)
		}
	}()

	logger.Info("starting voice edge http server", "httpAddr", cfg.HTTPAddr)
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
