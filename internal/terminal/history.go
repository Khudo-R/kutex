package terminal

import (
	"strings"
	"sync"
)

// DefaultHistorySize is the maximum number of commands kept by NewHistory.
const DefaultHistorySize = 1000

// History is Kutex's own in-memory list of commands run in the terminal,
// independent of the shell's history file. It outlives shell restarts.
//
// It behaves like a most-recently-used list: adding a command that is already
// present moves it to the front instead of storing a duplicate.
type History struct {
	mu      sync.Mutex
	max     int
	entries []string // oldest first
}

// NewHistory creates an empty History holding at most max commands.
// A max of 0 or less uses DefaultHistorySize.
func NewHistory(max int) *History {
	if max <= 0 {
		max = DefaultHistorySize
	}
	return &History{max: max}
}

// Add records a command. Surrounding whitespace is trimmed and empty commands
// are ignored. It reports whether the command was recorded.
func (h *History) Add(command string) bool {
	command = strings.TrimSpace(command)
	if command == "" {
		return false
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for i, e := range h.entries {
		if e == command {
			h.entries = append(h.entries[:i], h.entries[i+1:]...)
			break
		}
	}
	h.entries = append(h.entries, command)
	if over := len(h.entries) - h.max; over > 0 {
		h.entries = append([]string(nil), h.entries[over:]...)
	}
	return true
}

// List returns a copy of the recorded commands, most recent first.
func (h *History) List() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	out := make([]string, len(h.entries))
	for i, e := range h.entries {
		out[len(h.entries)-1-i] = e
	}
	return out
}

// Clear removes all recorded commands.
func (h *History) Clear() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.entries = nil
}
