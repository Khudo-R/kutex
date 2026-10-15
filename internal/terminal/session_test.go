package terminal

import (
	"strings"
	"sync"
	"testing"
	"time"
)

func TestSessionLifecycle(t *testing.T) {
	s := NewSession()
	if s.IsRunning() {
		t.Fatal("expected session not to be running initially")
	}

	var mu sync.Mutex
	var output strings.Builder
	exitCode := -1

	onOutput := func(b64 string) {
		mu.Lock()
		defer mu.Unlock()
		output.WriteString(b64)
	}

	onExit := func(code int) {
		mu.Lock()
		defer mu.Unlock()
		exitCode = code
	}

	err := s.Start(80, 24, "", onOutput, onExit)
	if err != nil {
		t.Fatalf("session start failed: %v", err)
	}
	defer s.Stop()

	if !s.IsRunning() {
		t.Fatal("expected session to be running after start")
	}
	if s.Pid() <= 0 {
		t.Fatalf("expected positive PID, got %d", s.Pid())
	}

	// Test write
	err = s.Write("echo HELLO_SESSION\r")
	if err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// Test resize
	err = s.Resize(100, 30)
	if err != nil {
		t.Fatalf("resize failed: %v", err)
	}

	// Wait briefly for output
	time.Sleep(150 * time.Millisecond)

	mu.Lock()
	hasOutput := output.Len() > 0
	mu.Unlock()

	if !hasOutput {
		t.Fatal("expected session output from echo")
	}

	// Stop session
	s.Stop()
	if s.IsRunning() {
		t.Fatal("expected session not to be running after Stop")
	}
	_ = exitCode
}
