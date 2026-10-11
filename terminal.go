package main

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Events emitted to the frontend.
const (
	// EventTerminalOutput carries a base64-encoded chunk of raw PTY output.
	// Base64 is used because chunks may split multi-byte UTF-8 sequences,
	// which would get mangled if sent as a JSON string.
	EventTerminalOutput = "terminal:output"
	// EventTerminalExit carries the shell's exit code.
	EventTerminalExit = "terminal:exit"
)

var errNotRunning = errors.New("terminal: shell is not running")

// Terminal runs the user's shell inside a pseudo-terminal (PTY) and bridges it
// to the frontend: keystrokes come in via Write, output goes out via events.
type Terminal struct {
	ctx context.Context

	mu  sync.Mutex
	cmd *exec.Cmd
	pty *os.File
}

// NewTerminal creates a new Terminal.
func NewTerminal() *Terminal {
	return &Terminal{}
}

func (t *Terminal) startup(ctx context.Context) {
	t.ctx = ctx
}

func (t *Terminal) shutdown(_ context.Context) {
	t.Stop()
}

// Start launches the user's shell in a new PTY of the given size.
// If a shell is already running it is stopped first.
func (t *Terminal) Start(cols, rows int) error {
	t.Stop()

	cmd := exec.Command(defaultShell())
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	if home, err := os.UserHomeDir(); err == nil {
		cmd.Dir = home
	}

	f, err := pty.StartWithSize(cmd, winsize(cols, rows))
	if err != nil {
		return err
	}

	t.mu.Lock()
	t.cmd, t.pty = cmd, f
	t.mu.Unlock()

	go t.pump(cmd, f)
	return nil
}

// Write sends user input (keystrokes, pasted text) to the shell.
func (t *Terminal) Write(data string) error {
	f := t.current()
	if f == nil {
		return errNotRunning
	}
	_, err := f.Write([]byte(data))
	return err
}

// Resize updates the PTY size so programs like `ls`, `vim` and `htop`
// lay out their output correctly. It is a no-op if no shell is running.
func (t *Terminal) Resize(cols, rows int) error {
	f := t.current()
	if f == nil {
		return nil
	}
	return pty.Setsize(f, winsize(cols, rows))
}

// Stop kills the running shell, if any.
func (t *Terminal) Stop() {
	t.mu.Lock()
	cmd, f := t.cmd, t.pty
	t.cmd, t.pty = nil, nil
	t.mu.Unlock()

	if cmd == nil {
		return
	}
	// Closing the PTY master sends SIGHUP to the shell's children; killing the
	// shell itself makes sure it doesn't linger. pump() reaps the process.
	_ = cmd.Process.Kill()
	_ = f.Close()
}

func (t *Terminal) current() *os.File {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.pty
}

// pump forwards PTY output to the frontend until the shell exits.
func (t *Terminal) pump(cmd *exec.Cmd, f *os.File) {
	buf := make([]byte, 32*1024)
	for {
		n, err := f.Read(buf)
		// Drop output from a session that was replaced by Stop/Start.
		if n > 0 && t.current() == f {
			runtime.EventsEmit(t.ctx, EventTerminalOutput, base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if err != nil {
			break // EIO on Linux once the shell exits, or "file closed" after Stop.
		}
	}
	_ = cmd.Wait()

	t.mu.Lock()
	stillCurrent := t.pty == f
	if stillCurrent {
		t.cmd, t.pty = nil, nil
	}
	t.mu.Unlock()

	// Only report exits the user didn't ask for (e.g. typing `exit`).
	if stillCurrent {
		_ = f.Close()
		runtime.EventsEmit(t.ctx, EventTerminalExit, cmd.ProcessState.ExitCode())
	}
}

func defaultShell() string {
	if sh := os.Getenv("SHELL"); sh != "" {
		return sh
	}
	for _, sh := range []string{"/bin/bash", "/bin/zsh", "/bin/sh"} {
		if _, err := os.Stat(sh); err == nil {
			return sh
		}
	}
	return "sh"
}

func winsize(cols, rows int) *pty.Winsize {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	return &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}
}
