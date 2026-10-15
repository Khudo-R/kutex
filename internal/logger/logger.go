package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"
)

// Level represents logging verbosity.
type Level = slog.Level

const (
	LevelDebug = slog.LevelDebug
	LevelInfo  = slog.LevelInfo
	LevelWarn  = slog.LevelWarn
	LevelError = slog.LevelError
)

// Config specifies configuration options for the logger.
type Config struct {
	Level    slog.Level
	FilePath string
	UseColor bool
	Output   io.Writer
}

// Logger wraps slog.Logger with custom formatting, component tagging, and file logging.
type Logger struct {
	slog    *slog.Logger
	file    *os.File
	handler slog.Handler
}

var (
	defaultLogger *Logger
	defaultOnce   sync.Once
	mu            sync.RWMutex
)

func init() {
	initDefault()
}

func defaultUseColor() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	return os.Getenv("TERM") != "dumb"
}

func initDefault() {
	handler := NewConsoleHandler(os.Stderr, nil, LevelInfo, defaultUseColor())
	defaultLogger = &Logger{
		slog:    slog.New(handler),
		handler: handler,
	}
	slog.SetDefault(defaultLogger.slog)
}

// New creates a new Logger from the provided Config.
func New(cfg Config) (*Logger, error) {
	out := cfg.Output
	if out == nil {
		out = os.Stderr
	}

	var file *os.File
	var err error
	if cfg.FilePath != "" {
		file, err = os.OpenFile(cfg.FilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return nil, fmt.Errorf("open log file %q: %w", cfg.FilePath, err)
		}
	}

	handler := NewConsoleHandler(out, file, cfg.Level, cfg.UseColor)
	sl := slog.New(handler)

	return &Logger{
		slog:    sl,
		file:    file,
		handler: handler,
	}, nil
}

// Init initializes the package default logger with the given configuration.
func Init(cfg Config) (*Logger, error) {
	l, err := New(cfg)
	if err != nil {
		return nil, err
	}

	mu.Lock()
	if defaultLogger != nil && defaultLogger.file != nil {
		_ = defaultLogger.file.Close()
	}
	defaultLogger = l
	slog.SetDefault(l.slog)
	mu.Unlock()

	return l, nil
}

// Default returns the default global logger.
func Default() *Logger {
	mu.RLock()
	defer mu.RUnlock()
	return defaultLogger
}

// Close closes the underlying log file if one was configured.
func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

// Slog returns the underlying *slog.Logger for interoperability.
func (l *Logger) Slog() *slog.Logger {
	return l.slog
}

// With returns a new Logger that adds the given key-value attributes to every log record.
func (l *Logger) With(args ...any) *Logger {
	return &Logger{
		slog:    l.slog.With(args...),
		file:    l.file,
		handler: l.handler,
	}
}

// Component returns a new Logger tagged with the specified component name.
func (l *Logger) Component(name string) *Logger {
	return l.With("component", name)
}

// Debug logs at LevelDebug.
func (l *Logger) Debug(msg string, args ...any) {
	l.slog.Debug(msg, args...)
}

// Info logs at LevelInfo.
func (l *Logger) Info(msg string, args ...any) {
	l.slog.Info(msg, args...)
}

// Warn logs at LevelWarn.
func (l *Logger) Warn(msg string, args ...any) {
	l.slog.Warn(msg, args...)
}

// Error logs at LevelError.
func (l *Logger) Error(msg string, args ...any) {
	l.slog.Error(msg, args...)
}

// Package-level convenience functions delegating to Default().

// Debug logs at LevelDebug using the default logger.
func Debug(msg string, args ...any) {
	Default().Debug(msg, args...)
}

// Info logs at LevelInfo using the default logger.
func Info(msg string, args ...any) {
	Default().Info(msg, args...)
}

// Warn logs at LevelWarn using the default logger.
func Warn(msg string, args ...any) {
	Default().Warn(msg, args...)
}

// Error logs at LevelError using the default logger.
func Error(msg string, args ...any) {
	Default().Error(msg, args...)
}

// With returns a child logger of Default() with additional attributes.
func With(args ...any) *Logger {
	return Default().With(args...)
}

// Component returns a child logger of Default() tagged with the given component name.
func Component(name string) *Logger {
	return Default().Component(name)
}
