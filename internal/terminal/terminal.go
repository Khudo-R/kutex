package terminal

import (
	"context"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Terminal is the primary backend service bound to Wails. It bridges the frontend
// to the interactive PTY session and background command executor.
type Terminal struct {
	ctx      context.Context
	session  *Session
	executor *Executor
}

// New creates a new Terminal service.
func New() *Terminal {
	return &Terminal{
		session:  NewSession(),
		executor: NewExecutor(),
	}
}

// Startup is called by Wails during application startup.
func (t *Terminal) Startup(ctx context.Context) {
	t.ctx = ctx
}

// Shutdown is called by Wails during application shutdown.
func (t *Terminal) Shutdown(_ context.Context) {
	t.Stop()
}

// Start launches the user's shell in an interactive PTY session.
func (t *Terminal) Start(cols, rows int) error {
	cwd := t.GetCwd()

	onOutput := func(b64 string) {
		if t.ctx != nil {
			runtime.EventsEmit(t.ctx, EventTerminalOutput, b64)
		}
	}

	onExit := func(code int) {
		if t.ctx != nil {
			runtime.EventsEmit(t.ctx, EventTerminalExit, code)
		}
	}

	return t.session.Start(cols, rows, cwd, onOutput, onExit)
}

// Write forwards user input (keystrokes, pasted text) to the interactive shell PTY.
func (t *Terminal) Write(data string) error {
	return t.session.Write(data)
}

// Resize updates the terminal size so CLI programs lay out properly.
func (t *Terminal) Resize(cols, rows int) error {
	return t.session.Resize(cols, rows)
}

// Stop terminates the interactive shell process.
func (t *Terminal) Stop() {
	t.session.Stop()
}

// RunCommand injects a command string followed by Enter into the active interactive PTY.
func (t *Terminal) RunCommand(command string) error {
	if !t.session.IsRunning() {
		return errNotRunning
	}
	cmd := strings.TrimRight(command, "\r\n") + "\r"
	return t.session.Write(cmd)
}

// ExecuteCommand runs a shell command in the background and returns its combined output.
// Simple "cd" commands update the tracked working directory across calls.
func (t *Terminal) ExecuteCommand(command string) (string, error) {
	return t.executor.Execute(command, t.session.Pid())
}

// GetCwd returns the current working directory of the terminal.
func (t *Terminal) GetCwd() string {
	return t.executor.GetCwd(t.session.Pid())
}
