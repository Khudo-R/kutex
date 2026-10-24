package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"
)

// ANSI color codes for terminal formatting.
const (
	colorReset   = "\033[0m"
	colorBold    = "\033[1m"
	colorDim     = "\033[2m"
	colorRed     = "\033[31m"
	colorGreen   = "\033[32m"
	colorYellow  = "\033[33m"
	colorMagenta = "\033[35m"
	colorCyan    = "\033[36m"
)

// ConsoleHandler is a custom slog.Handler that formats logs cleanly for terminal and file outputs.
type ConsoleHandler struct {
	mu       sync.Mutex
	out      io.Writer
	file     io.Writer
	level    slog.Level
	useColor bool
	attrs    []slog.Attr
	groups   []string
}

// NewConsoleHandler creates a new ConsoleHandler.
func NewConsoleHandler(out io.Writer, file io.Writer, level slog.Level, useColor bool) *ConsoleHandler {
	if out == nil {
		out = os.Stderr
	}
	return &ConsoleHandler{
		out:      out,
		file:     file,
		level:    level,
		useColor: useColor,
	}
}

func (h *ConsoleHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *ConsoleHandler) Handle(_ context.Context, r slog.Record) error {
	var component string
	var attrs []slog.Attr

	// Collect handler's pre-bound attributes
	for _, a := range h.attrs {
		if a.Key == "component" {
			component = a.Value.String()
		} else {
			attrs = append(attrs, a)
		}
	}

	// Collect record attributes
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "component" {
			component = a.Value.String()
		} else {
			attrs = append(attrs, a)
		}
		return true
	})

	timeStr := r.Time.Format("15:04:05.000")
	levelStr, levelColor := formatLevel(r.Level)

	h.mu.Lock()
	defer h.mu.Unlock()

	// Console output
	if h.out != nil {
		var consoleLine string
		if h.useColor {
			compStr := ""
			if component != "" {
				compStr = fmt.Sprintf("%s(%s)%s ", colorMagenta, component, colorReset)
			}
			consoleLine = fmt.Sprintf("%s%s%s %s%s%s%s %s%s%s%s",
				colorDim, timeStr, colorReset,
				colorBold, levelColor, levelStr, colorReset,
				compStr,
				levelColor, r.Message, colorReset,
			)
			for _, a := range attrs {
				consoleLine += fmt.Sprintf(" %s%s=%s%v%s", colorDim, a.Key, colorReset, a.Value.Any(), colorDim)
			}
			consoleLine += colorReset + "\n"
		} else {
			compStr := ""
			if component != "" {
				compStr = fmt.Sprintf("(%s) ", component)
			}
			consoleLine = fmt.Sprintf("%s %s %s%s", timeStr, levelStr, compStr, r.Message)
			for _, a := range attrs {
				consoleLine += fmt.Sprintf(" %s=%v", a.Key, a.Value.Any())
			}
			consoleLine += "\n"
		}
		_, _ = h.out.Write([]byte(consoleLine))
	}

	// File output (clean text without ANSI color codes)
	if h.file != nil {
		compStr := ""
		if component != "" {
			compStr = fmt.Sprintf("(%s) ", component)
		}
		fileDateStr := r.Time.Format("2006-01-02 15:04:05.000")
		fileLine := fmt.Sprintf("%s %s %s%s", fileDateStr, levelStr, compStr, r.Message)
		for _, a := range attrs {
			fileLine += fmt.Sprintf(" %s=%v", a.Key, a.Value.Any())
		}
		fileLine += "\n"
		_, _ = h.file.Write([]byte(fileLine))
	}

	return nil
}

func (h *ConsoleHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	newAttrs := make([]slog.Attr, len(h.attrs)+len(attrs))
	copy(newAttrs, h.attrs)
	copy(newAttrs[len(h.attrs):], attrs)

	return &ConsoleHandler{
		out:      h.out,
		file:     h.file,
		level:    h.level,
		useColor: h.useColor,
		attrs:    newAttrs,
		groups:   h.groups,
	}
}

func (h *ConsoleHandler) WithGroup(name string) slog.Handler {
	newGroups := make([]string, len(h.groups)+1)
	copy(newGroups, h.groups)
	newGroups[len(h.groups)] = name

	return &ConsoleHandler{
		out:      h.out,
		file:     h.file,
		level:    h.level,
		useColor: h.useColor,
		attrs:    h.attrs,
		groups:   newGroups,
	}
}

func formatLevel(level slog.Level) (string, string) {
	switch {
	case level < slog.LevelInfo:
		return "[DEBUG]", colorCyan
	case level < slog.LevelWarn:
		return "[INFO] ", colorGreen
	case level < slog.LevelError:
		return "[WARN] ", colorYellow
	default:
		return "[ERROR]", colorRed
	}
}
