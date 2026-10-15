package terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecutor(t *testing.T) {
	exec := NewExecutor()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("failed to get user home: %v", err)
	}

	// 1. Initial CWD should match user home
	if exec.GetCwd(0) != home {
		t.Fatalf("expected initial cwd %q, got %q", home, exec.GetCwd(0))
	}

	// 2. Execute pwd
	out, err := exec.Execute("pwd", 0)
	if err != nil {
		t.Fatalf("pwd failed: %v", err)
	}
	if strings.TrimSpace(out) != home {
		t.Fatalf("expected pwd %q, got %q", home, strings.TrimSpace(out))
	}

	// 3. Create a temp directory and navigate to it
	tempDir, err := os.MkdirTemp("", "kutex-executor-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if realDir, err := filepath.EvalSymlinks(tempDir); err == nil {
		tempDir = realDir
	}

	_, err = exec.Execute("cd "+tempDir, 0)
	if err != nil {
		t.Fatalf("cd to tempDir failed: %v", err)
	}
	if exec.GetCwd(0) != tempDir {
		t.Fatalf("expected cwd %q, got %q", tempDir, exec.GetCwd(0))
	}

	// 4. Create file and run ls
	testFile := filepath.Join(tempDir, "kutex_file.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	lsOut, err := exec.Execute("ls", 0)
	if err != nil {
		t.Fatalf("ls failed: %v", err)
	}
	if !strings.Contains(lsOut, "kutex_file.txt") {
		t.Fatalf("expected ls output to contain kutex_file.txt, got %q", lsOut)
	}

	// 5. cd - returns to previous directory (home)
	_, err = exec.Execute("cd -", 0)
	if err != nil {
		t.Fatalf("cd - failed: %v", err)
	}
	if exec.GetCwd(0) != home {
		t.Fatalf("expected cwd %q after cd -, got %q", home, exec.GetCwd(0))
	}

	// 6. cd ~ returns to home
	_, err = exec.Execute("cd ~", 0)
	if err != nil {
		t.Fatalf("cd ~ failed: %v", err)
	}
	if exec.GetCwd(0) != home {
		t.Fatalf("expected cwd %q after cd ~, got %q", home, exec.GetCwd(0))
	}

	// 7. Quoted cd
	_, err = exec.Execute(`cd "`+tempDir+`"`, 0)
	if err != nil {
		t.Fatalf("cd with quotes failed: %v", err)
	}
	if exec.GetCwd(0) != tempDir {
		t.Fatalf("expected cwd %q after quoted cd, got %q", tempDir, exec.GetCwd(0))
	}

	// 8. cd to nonexistent directory should error
	_, err = exec.Execute("cd /nonexistent_path_xyz_12345", 0)
	if err == nil {
		t.Fatalf("expected error when cd to nonexistent directory")
	}

	// 9. cd to regular file should error
	_, err = exec.Execute("cd "+testFile, 0)
	if err == nil {
		t.Fatalf("expected error when cd to regular file")
	}

	// 10. Nonexistent command should error
	_, err = exec.Execute("nonexistent_command_xyz_12345", 0)
	if err == nil {
		t.Fatalf("expected error for nonexistent command")
	}
}
