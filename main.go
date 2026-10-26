package main

import (
	"embed"

	"kutex/internal/logger"
	"kutex/internal/system"
	"kutex/internal/terminal"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
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

	err := wails.Run(&options.App{
		Title:  "kutex",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		Logger:           logger.NewWailsAdapter(nil),
		OnStartup:        term.Startup,
		OnShutdown:       term.Shutdown,
		Linux: &linux.Options{
			Icon:             appIcon,
			WebviewGpuPolicy: linux.WebviewGpuPolicyNever,
			ProgramName:      "kutex",
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
		Mac: &mac.Options{
			About: &mac.AboutInfo{
				Title:   "kutex",
				Message: "Desktop terminal emulator built with Go and Wails",
				Icon:    appIcon,
			},
		},
		Bind: []interface{}{
			term,
			sys,
		},
	})

	if err != nil {
		log.Error("Application error", "error", err)
	}
}
