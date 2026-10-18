package terminal

import (
	"os"
	"strings"
	"testing"
)

func TestTerminalService(t *testing.T) {
	term := New()

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("failed to get user home: %v", err)
	}

	if term.GetCwd() != home {
		t.Fatalf("expected initial cwd %q, got %q", home, term.GetCwd())
	}

	// ExecuteCommand should work even if interactive shell is not started
	out, err := term.ExecuteCommand("echo 'kutex service test'")
	if err != nil {
		t.Fatalf("ExecuteCommand failed: %v", err)
	}
	if !strings.Contains(out, "kutex service test") {
		t.Fatalf("expected output to contain 'kutex service test', got %q", out)
	}

	// RunCommand on unstarted terminal should return errNotRunning
	err = term.RunCommand("ls")
	if err != errNotRunning {
		t.Fatalf("expected errNotRunning, got %v", err)
	}
}

func TestTerminalHistory(t *testing.T) {
	term := New()

	term.AddHistory("ls")
	term.AddHistory("  ")
	term.AddHistory("git status")

	got := term.GetHistory()
	if len(got) != 2 || got[0] != "git status" || got[1] != "ls" {
		t.Fatalf("expected [git status ls], got %q", got)
	}

	// A RunCommand that fails must not be recorded.
	_ = term.RunCommand("make")
	if got := term.GetHistory(); len(got) != 2 {
		t.Fatalf("failed RunCommand must not be recorded, got %q", got)
	}

	term.ClearHistory()
	if got := term.GetHistory(); len(got) != 0 {
		t.Fatalf("expected empty history after ClearHistory, got %q", got)
	}
}
