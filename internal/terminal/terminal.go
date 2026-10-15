package terminal

import (
	"context"
	"strings"

	"kutex/internal/logger"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Terminal is the primary backend service bound to Wails. It bridges the frontend
// to the interactive PTY session and background command executor.
type Terminal struct {
	ctx      context.Context
	session  *Session
	executor *Executor
	log      *logger.Logger
}

// New creates a new Terminal service.
func New() *Terminal {
	return &Terminal{
		session:  NewSession(),
		executor: NewExecutor(),
		log:      logger.Component("terminal"),
	}
}

// Startup is called by Wails during application startup.
func (t *Terminal) Startup(ctx context.Context) {
	t.ctx = ctx
	t.log.Info("Terminal service initialized")
}

// Shutdown is called by Wails during application shutdown.
func (t *Terminal) Shutdown(_ context.Context) {
	t.log.Info("Terminal service shutting down")
	t.Stop()
}

// Start launches the user's shell in an interactive PTY session.
func (t *Terminal) Start(cols, rows int) error {
	cwd := t.GetCwd()
	t.log.Info("Starting interactive terminal", "cols", cols, "rows", rows, "cwd", cwd)

	onOutput := func(b64 string) {
		if t.ctx != nil {
			runtime.EventsEmit(t.ctx, EventTerminalOutput, b64)
		}
	}

	onExit := func(code int) {
		t.log.Info("Terminal process exited", "exit_code", code)
		if t.ctx != nil {
			runtime.EventsEmit(t.ctx, EventTerminalExit, code)
		}
	}

	err := t.session.Start(cols, rows, cwd, onOutput, onExit)
	if err != nil {
		t.log.Error("Failed to start terminal session", "error", err)
	}
	return err
}

// Write forwards user input (keystrokes, pasted text) to the interactive shell PTY.
func (t *Terminal) Write(data string) error {
	return t.session.Write(data)
}

// Resize updates the terminal size so CLI programs lay out properly.
func (t *Terminal) Resize(cols, rows int) error {
	t.log.Debug("Resizing terminal", "cols", cols, "rows", rows)
	return t.session.Resize(cols, rows)
}

// Stop terminates the interactive shell process.
func (t *Terminal) Stop() {
	t.log.Info("Stopping terminal session")
	t.session.Stop()
}

// RunCommand injects a command string followed by Enter into the active interactive PTY.
func (t *Terminal) RunCommand(command string) error {
	if !t.session.IsRunning() {
		t.log.Warn("Attempted RunCommand while terminal session is not running", "command", command)
		return errNotRunning
	}
	t.log.Debug("Injecting command into interactive terminal", "command", command)
	cmd := strings.TrimRight(command, "\r\n") + "\r"
	return t.session.Write(cmd)
}

// ExecuteCommand runs a shell command in the background and returns its combined output.
// Simple "cd" commands update the tracked working directory across calls.
func (t *Terminal) ExecuteCommand(command string) (string, error) {
	t.log.Debug("Executing background command", "command", command)
	out, err := t.executor.Execute(command, t.session.Pid())
	if err != nil {
		t.log.Warn("Background command returned error", "command", command, "error", err)
	}
	return out, err
}

// GetCwd returns the current working directory of the terminal.
func (t *Terminal) GetCwd() string {
	return t.executor.GetCwd(t.session.Pid())
}
