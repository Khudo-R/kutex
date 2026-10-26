package terminal

import "github.com/wailsapp/wails/v3/pkg/application"

// Events emitted to the frontend.
const (
	// EventTerminalOutput carries a base64-encoded chunk of raw PTY output.
	// Base64 is used because chunks may split multi-byte UTF-8 sequences,
	// which would get mangled if sent as a JSON string.
	EventTerminalOutput = "terminal:output"
	// EventTerminalExit carries the shell's exit code.
	EventTerminalExit = "terminal:exit"
)

func init() {
	application.RegisterEvent[string](EventTerminalOutput)
	application.RegisterEvent[int](EventTerminalExit)
}
