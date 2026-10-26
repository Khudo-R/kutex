//go:build windows

package terminal

import (
	"context"
	"encoding/base64"
	"os"
	"os/exec"
	"sync"

	"github.com/UserExistsError/conpty"
)

// Session manages an interactive shell process running inside a Windows ConPTY pseudo-console.
type Session struct {
	mu     sync.Mutex
	cpty   *conpty.ConPty
	ctx    context.Context
	cancel context.CancelFunc
}

// NewSession creates a new unstarted Session.
func NewSession() *Session {
	return &Session{}
}

// Start launches a new interactive shell in a ConPTY with the specified dimensions and directory.
func (s *Session) Start(cols, rows int, dir string, onOutput OutputHandler, onExit ExitHandler) error {
	s.Stop()

	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	shell := defaultShell()
	var opts []conpty.ConPtyOption
	opts = append(opts, conpty.ConPtyDimensions(cols, rows))
	if dir != "" {
		opts = append(opts, conpty.ConPtyWorkDir(dir))
	}
	env := append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	opts = append(opts, conpty.ConPtyEnv(env))

	cpty, err := conpty.Start(shell, opts...)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cpty = cpty
	s.ctx = ctx
	s.cancel = cancel
	s.mu.Unlock()

	go s.pump(cpty, ctx, onOutput, onExit)
	return nil
}

// Write sends user input (keystrokes, pasted text) to the ConPTY input pipe.
func (s *Session) Write(data string) error {
	cpty := s.currentPty()
	if cpty == nil {
		return errNotRunning
	}
	_, err := cpty.Write([]byte(data))
	return err
}

// Resize updates the ConPTY window size.
func (s *Session) Resize(cols, rows int) error {
	cpty := s.currentPty()
	if cpty == nil {
		return nil
	}
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	return cpty.Resize(cols, rows)
}

// Pid returns the process ID of the running shell, or 0 if not running.
func (s *Session) Pid() int {
	cpty := s.currentPty()
	if cpty != nil {
		return cpty.Pid()
	}
	return 0
}

// IsRunning reports whether the session currently has an active shell.
func (s *Session) IsRunning() bool {
	return s.currentPty() != nil
}

// Stop terminates the running shell process, if any, and closes the ConPTY.
func (s *Session) Stop() {
	s.mu.Lock()
	cpty := s.cpty
	s.cpty = nil
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.mu.Unlock()

	if cpty == nil {
		return
	}
	_ = cpty.Close()
}

func (s *Session) currentPty() *conpty.ConPty {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cpty
}

// pump forwards ConPTY output until the shell exits.
func (s *Session) pump(cpty *conpty.ConPty, ctx context.Context, onOutput OutputHandler, onExit ExitHandler) {
	buf := make([]byte, 32*1024)
	for {
		n, err := cpty.Read(buf)
		if n > 0 && s.currentPty() == cpty && onOutput != nil {
			onOutput(base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if err != nil {
			break
		}
	}

	exitCode, _ := cpty.Wait(ctx)

	s.mu.Lock()
	stillCurrent := s.cpty == cpty
	if stillCurrent {
		s.cpty = nil
		if s.cancel != nil {
			s.cancel()
			s.cancel = nil
		}
	}
	s.mu.Unlock()

	if stillCurrent {
		_ = cpty.Close()
		if onExit != nil {
			onExit(int(exitCode))
		}
	}
}

func defaultShell() string {
	// 1. If SHELL environment variable is explicitly set, check if executable
	if sh := os.Getenv("SHELL"); sh != "" {
		if _, err := exec.LookPath(sh); err == nil {
			return sh
		}
	}
	// 2. PowerShell 7+ (pwsh.exe)
	if pwsh, err := exec.LookPath("pwsh.exe"); err == nil {
		return pwsh
	}
	// 3. Windows PowerShell (powershell.exe) - installed by default on Windows 10 & 11
	if ps, err := exec.LookPath("powershell.exe"); err == nil {
		return ps
	}
	// 4. Fallback to COMSPEC (cmd.exe)
	if comspec := os.Getenv("COMSPEC"); comspec != "" {
		return comspec
	}
	return "cmd.exe"
}
