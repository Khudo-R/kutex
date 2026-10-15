package logger

import (
	"bytes"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConsoleHandlerFormatting(t *testing.T) {
	buf := &bytes.Buffer{}
	handler := NewConsoleHandler(buf, nil, LevelDebug, false)
	l := &Logger{
		slog:    newSlogLogger(handler),
		handler: handler,
	}

	l.Debug("debug message", "key1", "val1")
	l.Info("info message", "count", 42)
	l.Warn("warn message")
	l.Error("error message", "err", "something broke")

	out := buf.String()
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 lines, got %d: %q", len(lines), out)
	}

	if !strings.Contains(lines[0], "[DEBUG]") || !strings.Contains(lines[0], "debug message") || !strings.Contains(lines[0], "key1=val1") {
		t.Errorf("unexpected debug line format: %s", lines[0])
	}
	if !strings.Contains(lines[1], "[INFO] ") || !strings.Contains(lines[1], "info message") || !strings.Contains(lines[1], "count=42") {
		t.Errorf("unexpected info line format: %s", lines[1])
	}
	if !strings.Contains(lines[2], "[WARN] ") || !strings.Contains(lines[2], "warn message") {
		t.Errorf("unexpected warn line format: %s", lines[2])
	}
	if !strings.Contains(lines[3], "[ERROR]") || !strings.Contains(lines[3], "error message") || !strings.Contains(lines[3], "err=something broke") {
		t.Errorf("unexpected error line format: %s", lines[3])
	}
}

func TestComponentTagging(t *testing.T) {
	buf := &bytes.Buffer{}
	handler := NewConsoleHandler(buf, nil, LevelDebug, false)
	l := &Logger{
		slog:    newSlogLogger(handler),
		handler: handler,
	}

	termLogger := l.Component("terminal")
	termLogger.Info("session started", "pid", 1234)

	out := buf.String()
	if !strings.Contains(out, "(terminal)") {
		t.Errorf("expected output to contain (terminal), got: %s", out)
	}
	if !strings.Contains(out, "pid=1234") {
		t.Errorf("expected output to contain pid=1234, got: %s", out)
	}
}

func TestLogLevelFiltering(t *testing.T) {
	buf := &bytes.Buffer{}
	handler := NewConsoleHandler(buf, nil, LevelWarn, false)
	l := &Logger{
		slog:    newSlogLogger(handler),
		handler: handler,
	}

	l.Debug("should be ignored")
	l.Info("should also be ignored")
	l.Warn("visible warning")
	l.Error("visible error")

	out := buf.String()
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d: %q", len(lines), out)
	}
	if !strings.Contains(lines[0], "visible warning") {
		t.Errorf("expected warning, got: %s", lines[0])
	}
	if !strings.Contains(lines[1], "visible error") {
		t.Errorf("expected error, got: %s", lines[1])
	}
}

func TestColorFormatting(t *testing.T) {
	buf := &bytes.Buffer{}
	handler := NewConsoleHandler(buf, nil, LevelInfo, true)
	l := &Logger{
		slog:    newSlogLogger(handler),
		handler: handler,
	}

	l.Component("app").Info("colored output test", "status", "ok")

	out := buf.String()
	// Should contain ANSI color codes
	if !strings.Contains(out, "\033[") {
		t.Errorf("expected ANSI color codes in colored output, got: %q", out)
	}
	if !strings.Contains(out, "colored output test") {
		t.Errorf("expected message in output, got: %q", out)
	}
}

func TestFileLogging(t *testing.T) {
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "test.log")

	buf := &bytes.Buffer{}
	l, err := New(Config{
		Level:    LevelDebug,
		FilePath: logFile,
		UseColor: true,
		Output:   buf,
	})
	if err != nil {
		t.Fatalf("New logger failed: %v", err)
	}
	defer l.Close()

	l.Component("sys").Info("writing to file", "attempt", 1)

	// Close file to flush
	_ = l.Close()

	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("failed to read log file: %v", err)
	}
	fileStr := string(content)

	// File output should NOT contain ANSI color codes
	if strings.Contains(fileStr, "\033[") {
		t.Errorf("file output should not contain ANSI escape codes, got: %q", fileStr)
	}
	if !strings.Contains(fileStr, "[INFO] ") || !strings.Contains(fileStr, "(sys)") || !strings.Contains(fileStr, "writing to file") {
		t.Errorf("file output missing expected format: %q", fileStr)
	}
}

func TestWailsAdapter(t *testing.T) {
	buf := &bytes.Buffer{}
	handler := NewConsoleHandler(buf, nil, LevelDebug, false)
	l := &Logger{
		slog:    newSlogLogger(handler),
		handler: handler,
	}

	adapter := NewWailsAdapter(l)
	adapter.Print("print log")
	adapter.Trace("trace log")
	adapter.Debug("debug log")
	adapter.Info("info log")
	adapter.Warning("warning log")
	adapter.Error("error log")
	adapter.Fatal("fatal log")

	out := buf.String()
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 7 {
		t.Fatalf("expected 7 lines from Wails adapter, got %d: %q", len(lines), out)
	}

	for _, line := range lines {
		if !strings.Contains(line, "(wails)") {
			t.Errorf("expected line to contain (wails): %s", line)
		}
	}
}

func TestInitAndDefault(t *testing.T) {
	buf := &bytes.Buffer{}
	_, err := Init(Config{
		Level:    LevelDebug,
		UseColor: false,
		Output:   buf,
	})
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	Debug("global debug")
	Info("global info")
	Warn("global warn")
	Error("global error")

	out := buf.String()
	if !strings.Contains(out, "global debug") || !strings.Contains(out, "global info") {
		t.Errorf("default logger did not capture global calls: %s", out)
	}
}

func newSlogLogger(h slog.Handler) *slog.Logger {
	return slog.New(h)
}
