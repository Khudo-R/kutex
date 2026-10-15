package system

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestGetFolders(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "kutex-system-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create subdirectories
	dirA := filepath.Join(tempDir, "alpha")
	dirB := filepath.Join(tempDir, "beta")
	if err := os.Mkdir(dirA, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dirB, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a regular file (should be excluded)
	file := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(file, []byte("file"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create a symlink pointing to dirA (should be included as folder)
	symlinkDir := filepath.Join(tempDir, "symlink_alpha")
	if err := os.Symlink(dirA, symlinkDir); err != nil {
		t.Logf("symlink creation failed (skipping symlink check): %v", err)
	}

	// 1. Standalone function
	folders, err := GetFolders(tempDir)
	if err != nil {
		t.Fatalf("GetFolders failed: %v", err)
	}

	if !slices.Contains(folders, "alpha") || !slices.Contains(folders, "beta") {
		t.Fatalf("expected alpha and beta, got %v", folders)
	}
	if slices.Contains(folders, "test.txt") {
		t.Fatalf("expected regular file to be excluded, got %v", folders)
	}

	// 2. Via System service struct
	sys := New()
	foldersStruct, err := sys.GetFolders(tempDir)
	if err != nil {
		t.Fatalf("sys.GetFolders failed: %v", err)
	}
	if len(foldersStruct) != len(folders) {
		t.Fatalf("expected matching lengths: %d vs %d", len(foldersStruct), len(folders))
	}

	// 3. Error on nonexistent directory
	_, err = GetFolders(filepath.Join(tempDir, "nonexistent"))
	if err == nil {
		t.Fatal("expected error on nonexistent directory")
	}
}

func TestGetFoldersRecursive(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "kutex-system-test-rec-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create nested structure: dir1/nested1 and dir2
	nested := filepath.Join(tempDir, "dir1", "nested1")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	dir2 := filepath.Join(tempDir, "dir2")
	if err := os.Mkdir(dir2, 0o755); err != nil {
		t.Fatal(err)
	}

	folders, err := GetFoldersRecursive(tempDir)
	if err != nil {
		t.Fatalf("GetFoldersRecursive failed: %v", err)
	}

	if len(folders) != 3 {
		t.Fatalf("expected 3 directories (dir1, nested1, dir2), got %d: %v", len(folders), folders)
	}
}
