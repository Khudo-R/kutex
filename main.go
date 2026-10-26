package main

import (
	"embed"

	"kutex/internal/logger"
	"kutex/internal/system"
	"kutex/internal/terminal"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	log := logger.Component("main")
	log.Info("Starting kutex...")

	term := terminal.New()
	sys := system.New()

	app := application.New(application.Options{
		Name:        "kutex",
		Description: "Desktop terminal emulator built with Go and Wails",
		Icon:        appIcon,
		Logger:      logger.NewWailsAdapter(nil),
		Services: []application.Service{
			application.NewService(term),
			application.NewService(sys),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Linux: application.LinuxOptions{
			ProgramName: "kutex",
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "kutex",
		Width:            1024,
		Height:           768,
		BackgroundColour: application.NewRGBA(27, 38, 54, 1),
		URL:              "/",
		Linux: application.LinuxWindow{
			Icon:             appIcon,
			WebviewGpuPolicy: application.WebviewGpuPolicyNever,
		},
		Windows: application.WindowsWindow{
			DisableIcon: false,
		},
	})

	if err := app.Run(); err != nil {
		log.Error("Application error", "error", err)
	}
}
