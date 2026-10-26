---
name: wails3
description: >
  Expert guidance for building desktop applications with Wails v3. Use whenever working on Wails,
  Wails v3, Go desktop webviews, backend-to-frontend bindings, or desktop UI with Go. Prevents blending
  incompatible Wails v2 APIs (e.g. wails.Run, context-threading, runtime.EventsEmit, wailsjs/) with Wails v3
  (application.New, Services, app.Event.Emit, frontend/bindings/).
---

# Wails v3 Expert Skill

Wails v3 is an application-centric rewrite for building native desktop applications with a Go backend and a modern web frontend.

> **CRITICAL RULE**: Wails v2 and v3 have incompatible APIs that LLMs frequently blend.
> **Every response and implementation must be pure Wails v3.** Never introduce v2 patterns.

---

## 1. Quick Version Detection & Red Flags

| Aspect | ❌ Wails v2 (Do NOT use) | ✅ Wails v3 (Standard) |
|---|---|---|
| **Go Module** | `github.com/wailsapp/wails/v2` | `github.com/wailsapp/wails/v3` |
| **CLI Tool** | `wails` (`wails dev`, `wails build`) | `wails3` (`wails3 dev`, `wails3 build`) |
| **Config / Build** | `wails.json` | `build/config.yml` and `Taskfile.yml` (go-task) |
| **App Entrypoint** | `wails.Run(&options.App{ ... })` | `app := application.New(application.Options{ ... })` |
| **Window Creation** | Inside `options.App` (single window) | `app.Window.NewWithOptions(application.WebviewWindowOptions{ ... })` |
| **Go Struct Binding**| `Bind: []interface{}{app}` | `Services: []application.Service{application.NewService(svc)}` |
| **Runtime Calls** | Global `runtime.WindowSetTitle(ctx, ...)` | Manager methods: `app.Window.Current().SetTitle(...)` |
| **Event Emission** | `runtime.EventsEmit(ctx, "name", data)` | `app.Event.Emit("name", data)` (no context needed) |
| **Event Registration**| Untyped `...interface{}` | Strongly typed `application.RegisterEvent[T]("name")` |
| **Frontend Runtime**| `../wailsjs/runtime/runtime` | `@wailsio/runtime` (`import { Events } from '@wailsio/runtime'`) |
| **Generated Bindings**| `../wailsjs/go/<pkg>/<Struct>` | `./bindings/<module-path>/<pkg>/<service>` |

---

## 2. Canonical Backend Architecture (`main.go`)

```go
package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	term := terminal.New()
	sys := system.New()

	app := application.New(application.Options{
		Name:        "myapp",
		Description: "Desktop Application",
		Services: []application.Service{
			application.NewService(term),
			application.NewService(sys),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Linux: application.LinuxOptions{
			ProgramName: "myapp",
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "myapp",
		Width:            1024,
		Height:           768,
		URL:              "/",
		BackgroundColour: application.NewRGBA(27, 38, 54, 1),
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
```

---

## 3. The Service Model (No Context Coupling)

Services in v3 are clean Go structs without embedded `ctx context.Context`.

```go
type TerminalService struct {
	// Business logic fields only
}

// Optional lifecycle hooks:
func (s *TerminalService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Initialize resources on app start (cancelation of ctx signals shutdown)
	return nil
}

func (s *TerminalService) ServiceShutdown() error {
	// Cleanup on app close
	return nil
}

// Exported methods become async JS functions:
func (s *TerminalService) ExecuteCommand(cmd string) (string, error) {
	// Return value and error map directly to Promise resolve/reject
	return "output", nil
}
```

### Accessing the App from Services
- Do **not** store context to call runtime methods.
- If the service needs application-level actions (e.g. emitting events):
  ```go
  if app := application.Get(); app != nil {
      app.Event.Emit("terminal:output", data)
  }
  ```
- Or pass `*application.App` explicitly during constructor dependency injection.

---

## 4. Manager APIs (Object-Oriented Design)

Wails v3 organizes capabilities under dedicated manager objects rather than global functions:

- **Windows**: `app.Window.NewWithOptions(...)`, `app.Window.Current()`, `window.SetSize(...)`, `window.Close()`
- **Events**: `app.Event.Emit("name", data)`, `app.Event.On("name", func(e *application.CustomEvent) { ... })`
- **Dialogs**: `app.Dialog.OpenFileWithOptions(...)`, `app.Dialog.Info(...)`
- **Menus**: `menu := app.NewMenu()`, `fileMenu := menu.AddSubmenu("File")`
- **System Tray**: `tray := app.SystemTray.New()`
- **Logger**: Pass standard `*slog.Logger` to `application.Options.Logger`.

---

## 5. Event System & Frontend Integration

### Go Side
Register custom event types in `init()` for static type-generation:
```go
func init() {
	application.RegisterEvent[string]("terminal:output")
	application.RegisterEvent[int]("terminal:exit")
}
```

### Frontend Side
Wails v3 uses the `@wailsio/runtime` package. Notice that `Events.On` passes an event object with `.data`:
```ts
import { Events } from '@wailsio/runtime'

// Listening:
const unsubscribe = Events.On('terminal:output', (event: { data: string }) => {
	console.log(event.data)
})

// Emitting:
Events.Emit('terminal:input', 'payload')
```

### Bindings
- Generate via: `wails3 generate bindings -ts`
- Imports live in `frontend/bindings/`:
  ```ts
  import { ExecuteCommand } from '@/shared/api' // re-exported from bindings
  // or direct:
  import { ExecuteCommand } from '../../../bindings/kutex/internal/terminal/terminal'
  ```

---

## 6. Build Orchestration (`Taskfile.yml` & `build/config.yml`)

Wails v3 replaces `wails.json` with transparent `go-task` tasks:
- `wails3 dev`: Launches the dev watcher with Vite HMR using `build/config.yml`.
- `wails3 build`: Runs the `Taskfile.yml` build pipeline.
- `wails3 generate bindings -ts`: Scans Go services and regenerates TypeScript bindings.
