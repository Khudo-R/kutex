package terminal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"kutex/internal/logger"
)

// Executor manages background shell command execution and tracks working directory.
type Executor struct {
	mu         sync.Mutex
	currentDir string
	prevDir    string
}

// NewExecutor creates a new Executor initialized with the user's home directory.
func NewExecutor() *Executor {
	e := &Executor{}
	if home, err := os.UserHomeDir(); err == nil {
		e.currentDir = home
	}
	return e
}

// GetCwd returns the current working directory.
// If an active process PID is provided, it first tries to inspect it on platforms that support it.
func (e *Executor) GetCwd(activePid int) string {
	if cwd := procCwd(activePid); cwd != "" {
		return cwd
	}

	e.mu.Lock()
	dir := e.currentDir
	e.mu.Unlock()

	if dir != "" {
		return dir
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	return defaultRootDir()
}

// SetCwd updates the tracked working directory.
func (e *Executor) SetCwd(dir string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.prevDir = e.currentDir
	e.currentDir = dir
}

// Execute runs a command in the current working directory.
// Pure "cd" commands are intercepted to update the tracked working directory across calls.
func (e *Executor) Execute(command string, activePid int) (string, error) {
	trimmed := strings.TrimSpace(command)
	if trimmed == "" {
		return "", nil
	}

	cwd := e.GetCwd(activePid)

	// Intercept simple cd commands (without pipes, redirects, or chaining)
	if isPureCd(trimmed) {
		return e.handleCd(trimmed, cwd)
	}

	shell := defaultShell()
	cmd := buildShellCmd(shell, command)
	cmd.Dir = cwd

	out, err := cmd.CombinedOutput()
	return string(out), err
}

func isPureCd(cmd string) bool {
	if cmd == "cd" || strings.HasPrefix(cmd, "cd ") || strings.HasPrefix(cmd, "cd\t") {
		return !strings.ContainsAny(cmd, "|&;<>()$`")
	}
	return false
}

func (e *Executor) handleCd(cmd, cwd string) (string, error) {
	target := strings.TrimSpace(cmd[2:])

	// Handle Windows "cd /d <path>" flag to change drive & directory
	if strings.HasPrefix(strings.ToLower(target), "/d ") {
		target = strings.TrimSpace(target[3:])
	}

	// Strip surrounding quotes
	if len(target) >= 2 {
		if (target[0] == '"' && target[len(target)-1] == '"') ||
			(target[0] == '\'' && target[len(target)-1] == '\'') {
			target = target[1 : len(target)-1]
		}
	}

	var targetDir string
	if target == "" || target == "~" {
		targetDir, _ = os.UserHomeDir()
	} else if target == "-" {
		e.mu.Lock()
		targetDir = e.prevDir
		e.mu.Unlock()
		if targetDir == "" {
			targetDir = cwd
		}
	} else {
		if strings.HasPrefix(target, "~/") || strings.HasPrefix(target, "~\\") {
			if home, err := os.UserHomeDir(); err == nil {
				target = filepath.Join(home, target[2:])
			}
		}
		if filepath.IsAbs(target) {
			targetDir = filepath.Clean(target)
		} else {
			targetDir = filepath.Clean(filepath.Join(cwd, target))
		}
	}

	info, err := os.Stat(targetDir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("cd: not a directory: %s", targetDir)
	}

	e.SetCwd(targetDir)
	logger.Component("executor").Info("Changed working directory", "from", cwd, "to", targetDir)
	return "", nil
}
