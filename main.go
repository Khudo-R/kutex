package main

import (
	"embed"

	"kutex/internal/logger"
	"kutex/internal/system"
	"kutex/internal/terminal"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

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
		Bind: []interface{}{
			term,
			sys,
		},
	})

	if err != nil {
		log.Error("Application error", "error", err)
	}
}
