package terminal

import (
	"reflect"
	"testing"
)

func TestHistoryAddAndList(t *testing.T) {
	h := NewHistory(0)

	if got := h.List(); len(got) != 0 {
		t.Fatalf("expected empty history, got %q", got)
	}

	for _, cmd := range []string{"ls", "  git status  ", "", "   ", "pwd"} {
		h.Add(cmd)
	}

	want := []string{"pwd", "git status", "ls"}
	if got := h.List(); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestHistoryAddReportsRecorded(t *testing.T) {
	h := NewHistory(0)
	if h.Add("  ") {
		t.Fatal("expected blank command to be ignored")
	}
	if !h.Add("ls") {
		t.Fatal("expected command to be recorded")
	}
}

func TestHistoryDeduplicatesByMovingToFront(t *testing.T) {
	h := NewHistory(0)
	for _, cmd := range []string{"ls", "pwd", "make", "ls"} {
		h.Add(cmd)
	}

	want := []string{"ls", "make", "pwd"}
	if got := h.List(); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestHistoryDropsOldestBeyondMax(t *testing.T) {
	h := NewHistory(3)
	for _, cmd := range []string{"a", "b", "c", "d", "e"} {
		h.Add(cmd)
	}

	want := []string{"e", "d", "c"}
	if got := h.List(); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestHistoryListReturnsCopy(t *testing.T) {
	h := NewHistory(0)
	h.Add("ls")

	h.List()[0] = "rm -rf /"
	if got := h.List(); got[0] != "ls" {
		t.Fatalf("List must not expose internal state, got %q", got)
	}
}

func TestHistoryClear(t *testing.T) {
	h := NewHistory(0)
	h.Add("ls")
	h.Clear()

	if got := h.List(); len(got) != 0 {
		t.Fatalf("expected empty history after Clear, got %q", got)
	}
}
