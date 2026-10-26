package terminal

import (
	"context"
	"strings"

	"kutex/internal/logger"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Terminal is the primary backend service bound to Wails. It bridges the frontend
// to the interactive PTY session and background command executor.
type Terminal struct {
	session  *Session
	executor *Executor
	history  *History
	log      *logger.Logger
}

// New creates a new Terminal service.
func New() *Terminal {
	return &Terminal{
		session:  NewSession(),
		executor: NewExecutor(),
		history:  NewHistory(DefaultHistorySize),
		log:      logger.Component("terminal"),
	}
}

// ServiceStartup is called by Wails during application startup.
func (t *Terminal) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	t.log.Info("Terminal service initialized")
	return nil
}

// ServiceShutdown is called by Wails during application shutdown.
func (t *Terminal) ServiceShutdown() error {
	t.log.Info("Terminal service shutting down")
	t.Stop()
	return nil
}

// Start launches the user's shell in an interactive PTY session.
func (t *Terminal) Start(cols, rows int) error {
	cwd := t.GetCwd()
	t.log.Info("Starting interactive terminal", "cols", cols, "rows", rows, "cwd", cwd)

	onOutput := func(b64 string) {
		if app := application.Get(); app != nil {
			app.Event.Emit(EventTerminalOutput, b64)
		}
	}

	onExit := func(code int) {
		t.log.Info("Terminal process exited", "exit_code", code)
		if app := application.Get(); app != nil {
			app.Event.Emit(EventTerminalExit, code)
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
	if err := t.session.Write(cmd); err != nil {
		return err
	}
	t.history.Add(command)
	return nil
}

// AddHistory records a command the user ran in the interactive terminal.
// The frontend calls it when the user presses Enter on a command line.
func (t *Terminal) AddHistory(command string) {
	if t.history.Add(command) {
		t.log.Debug("Recorded command in history", "command", command)
	}
}

// GetHistory returns the recorded commands, most recent first.
func (t *Terminal) GetHistory() []string {
	return t.history.List()
}

// ClearHistory removes all recorded commands.
func (t *Terminal) ClearHistory() {
	t.log.Info("Clearing command history")
	t.history.Clear()
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
