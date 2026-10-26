# Build Directory

The `build` directory houses the Wails v3 build configuration, Taskfiles, and platform-specific packaging assets:

* `config.yml` - Project metadata and `wails3 dev` configuration
* `Taskfile.yml` - Common frontend, icon, and binding generation tasks
* `linux/` - Linux Taskfile, `.desktop`, AppImage, and nfpm packaging assets
* `darwin/` - macOS Taskfile, `Info.plist`, `Info.dev.plist`, and DMG/icon assets
* `windows/` - Windows Taskfile, `icon.ico`, `info.json`, `wails.exe.manifest`, NSIS, and MSIX assets

## macOS (`darwin/`)

- `Info.plist` - Main plist file used when packaging production macOS builds (`wails3 package`).
- `Info.dev.plist` - Development plist file used when running `wails3 dev`.

## Windows (`windows/`)

- `icon.ico` - Application icon embedded into the Windows `.syso` resource during `wails3 build`.
- `nsis/*` - NSIS installer scripts used by `wails3 package`.
- `info.json` - Application version/company metadata embedded into the executable properties.
- `wails.exe.manifest` - Application manifest file.
