package system

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"kutex/internal/logger"
)

// System provides filesystem and OS-level operations.
type System struct{}

// New creates a new System instance.
func New() *System {
	return &System{}
}

// GetFolders returns the names of all directories inside dirPath.
// If dirPath is empty, it inspects the current directory (".").
// It also resolves symlinks pointing to directories.
func (s *System) GetFolders(dirPath string) ([]string, error) {
	return GetFolders(dirPath)
}

// GetFoldersRecursive returns relative paths of all nested subdirectories under root.
func (s *System) GetFoldersRecursive(root string) ([]string, error) {
	return GetFoldersRecursive(root)
}

// GetFolders returns the names of all subdirectories inside dirPath.
// If dirPath is empty, "." is used. Symlinks targeting directories are included.
func GetFolders(dirPath string) ([]string, error) {
	if dirPath == "" {
		dirPath = "."
	}
	logger.Component("system").Debug("Reading directories", "path", dirPath)

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		logger.Component("system").Error("Failed to read directory", "path", dirPath, "error", err)
		return nil, fmt.Errorf("read directory %q: %w", dirPath, err)
	}

	var folders []string
	for _, entry := range entries {
		if entry.IsDir() {
			folders = append(folders, entry.Name())
			continue
		}

		// Check if symlink points to a directory
		if entry.Type()&os.ModeSymlink != 0 {
			target := filepath.Join(dirPath, entry.Name())
			if info, err := os.Stat(target); err == nil && info.IsDir() {
				folders = append(folders, entry.Name())
			}
		}
	}
	logger.Component("system").Debug("Discovered directories", "path", dirPath, "count", len(folders))
	return folders, nil
}

// GetFoldersRecursive discovers all nested subdirectories under root.
func GetFoldersRecursive(root string) ([]string, error) {
	if root == "" {
		root = "."
	}
	logger.Component("system").Debug("Reading recursive directories", "root", root)

	var folders []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && path != root {
			folders = append(folders, path)
		}
		return nil
	})
	if err != nil {
		logger.Component("system").Error("Failed to walk directory", "root", root, "error", err)
		return nil, fmt.Errorf("walk directory %q: %w", root, err)
	}

	logger.Component("system").Debug("Discovered recursive directories", "root", root, "count", len(folders))
	return folders, nil
}
