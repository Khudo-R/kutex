package terminal

import (
	"errors"
)

var errNotRunning = errors.New("terminal: shell is not running")

// OutputHandler receives base64-encoded output chunks from the PTY.
type OutputHandler func(base64Data string)

// ExitHandler receives the shell exit code when the process terminates.
type ExitHandler func(exitCode int)
