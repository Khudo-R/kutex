package logger

import (
	"fmt"

	wailslogger "github.com/wailsapp/wails/v2/pkg/logger"
)

// WailsAdapter implements github.com/wailsapp/wails/v2/pkg/logger.Logger
// to route Wails internal runtime logs into our structured logger tagged with component="wails".
type WailsAdapter struct {
	logger *Logger
}

// NewWailsAdapter creates a new WailsAdapter for the given Logger.
// If l is nil, Default() is used.
func NewWailsAdapter(l *Logger) wailslogger.Logger {
	if l == nil {
		l = Default()
	}
	return &WailsAdapter{
		logger: l.Component("wails"),
	}
}

// Print logs a generic message at Info level.
func (w *WailsAdapter) Print(message string) {
	w.logger.Info(message)
}

// Trace logs a trace message at Debug level.
func (w *WailsAdapter) Trace(message string) {
	w.logger.Debug(message)
}

// Debug logs a debug message at Debug level.
func (w *WailsAdapter) Debug(message string) {
	w.logger.Debug(message)
}

// Info logs an informational message at Info level.
func (w *WailsAdapter) Info(message string) {
	w.logger.Info(message)
}

// Warning logs a warning message at Warn level.
func (w *WailsAdapter) Warning(message string) {
	w.logger.Warn(message)
}

// Error logs an error message at Error level.
func (w *WailsAdapter) Error(message string) {
	w.logger.Error(message)
}

// Fatal logs a fatal message at Error level.
func (w *WailsAdapter) Fatal(message string) {
	w.logger.Error(fmt.Sprintf("FATAL: %s", message))
}
