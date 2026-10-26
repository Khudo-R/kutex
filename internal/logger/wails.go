package logger

import "log/slog"

// NewWailsAdapter returns a *slog.Logger tagged with component="wails"
// to route Wails v3 internal runtime logs into our structured logger.
// If l is nil, Default() is used.
func NewWailsAdapter(l *Logger) *slog.Logger {
	if l == nil {
		l = Default()
	}
	return l.Component("wails").Slog()
}
