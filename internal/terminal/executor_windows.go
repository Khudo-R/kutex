//go:build windows

package terminal

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func procCwd(_ int) string {
	// On Windows, inspecting another process's CWD requires reading remote PEB structures.
	// We fall back to the tracked Executor working directory.
	return ""
}

func defaultRootDir() string {
	if sysDrive := os.Getenv("SystemDrive"); sysDrive != "" {
		return sysDrive + `\`
	}
	return `C:\`
}

func buildShellCmd(shell, command string) *exec.Cmd {
	base := strings.ToLower(filepath.Base(shell))
	var cmd *exec.Cmd
	switch {
	case base == "cmd.exe" || base == "cmd":
		cmd = exec.Command(shell, "/c", command)
	case strings.Contains(base, "powershell") || strings.Contains(base, "pwsh"):
		cmd = exec.Command(shell, "-NoProfile", "-NonInteractive", "-Command", command)
	default:
		// Fallback for POSIX shells like bash.exe from Git/MSYS2
		cmd = exec.Command(shell, "-c", command)
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	return cmd
}
