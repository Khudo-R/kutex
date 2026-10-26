//go:build !windows

package terminal

import (
	"encoding/base64"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// Session manages an interactive shell process running inside a pseudo-terminal (PTY) on Unix.
type Session struct {
	mu  sync.Mutex
	cmd *exec.Cmd
	pty *os.File
}

// NewSession creates a new unstarted Session.
func NewSession() *Session {
	return &Session{}
}

// Start launches a new interactive shell in a PTY with the specified dimensions and directory.
func (s *Session) Start(cols, rows int, dir string, onOutput OutputHandler, onExit ExitHandler) error {
	s.Stop()

	cmd := exec.Command(defaultShell())
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	if dir != "" {
		cmd.Dir = dir
	}

	f, err := pty.StartWithSize(cmd, winsize(cols, rows))
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.cmd = cmd
	s.pty = f
	s.mu.Unlock()

	go s.pump(cmd, f, onOutput, onExit)
	return nil
}

// Write sends user input (keystrokes, pasted text) to the shell PTY.
func (s *Session) Write(data string) error {
	f := s.currentPty()
	if f == nil {
		return errNotRunning
	}
	_, err := f.Write([]byte(data))
	return err
}

// Resize updates the PTY window size.
func (s *Session) Resize(cols, rows int) error {
	f := s.currentPty()
	if f == nil {
		return nil
	}
	return pty.Setsize(f, winsize(cols, rows))
}

// Pid returns the process ID of the running shell, or 0 if not running.
func (s *Session) Pid() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cmd != nil && s.cmd.Process != nil {
		return s.cmd.Process.Pid
	}
	return 0
}

// IsRunning reports whether the session currently has an active shell.
func (s *Session) IsRunning() bool {
	return s.currentPty() != nil
}

// Stop terminates the running shell process, if any, and closes the PTY.
func (s *Session) Stop() {
	s.mu.Lock()
	cmd, f := s.cmd, s.pty
	s.cmd, s.pty = nil, nil
	s.mu.Unlock()

	if cmd == nil {
		return
	}
	// Closing master sends SIGHUP to the shell's children; killing the shell
	// ensures it doesn't linger. pump() reaps the process.
	_ = cmd.Process.Kill()
	_ = f.Close()
}

func (s *Session) currentPty() *os.File {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pty
}

// pump forwards PTY output until the shell exits.
func (s *Session) pump(cmd *exec.Cmd, f *os.File, onOutput OutputHandler, onExit ExitHandler) {
	buf := make([]byte, 32*1024)
	for {
		n, err := f.Read(buf)
		if n > 0 && s.currentPty() == f && onOutput != nil {
			onOutput(base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if err != nil {
			break
		}
	}
	_ = cmd.Wait()

	s.mu.Lock()
	stillCurrent := s.pty == f
	if stillCurrent {
		s.cmd, s.pty = nil, nil
	}
	s.mu.Unlock()

	if stillCurrent {
		_ = f.Close()
		if onExit != nil {
			onExit(cmd.ProcessState.ExitCode())
		}
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
