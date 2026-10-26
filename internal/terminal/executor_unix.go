//go:build !windows

package terminal

import (
	"fmt"
	"os"
	"os/exec"
)

func procCwd(activePid int) string {
	if activePid > 0 {
		if cwd, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", activePid)); err == nil && cwd != "" {
			return cwd
		}
	}
	return ""
}

func defaultRootDir() string {
	return "/"
}

func buildShellCmd(shell, command string) *exec.Cmd {
	cmd := exec.Command(shell, "-c", command)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	return cmd
}
