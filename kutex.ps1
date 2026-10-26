[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Command = "dev",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$RemainingArgs
)

$RootDir = $PSScriptRoot
Set-Location $RootDir

switch -Regex ($Command.ToLower()) {
    "^(dev)$" {
        wails3 dev -config ./build/config.yml -port 9245 @RemainingArgs
    }
    "^(build)$" {
        wails3 build @RemainingArgs
    }
    "^(package)$" {
        wails3 task package @RemainingArgs
    }
    "^(run)$" {
        wails3 task run @RemainingArgs
    }
    "^(test)$" {
        Write-Host "==> Running Go tests..." -ForegroundColor Cyan
        go test -v ./internal/...
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Write-Host "==> Running frontend tests..." -ForegroundColor Cyan
        pnpm --dir frontend test:run @RemainingArgs
    }
    "^(test:go)$" {
        go test -v ./internal/... @RemainingArgs
    }
    "^(test:fe|test:frontend)$" {
        pnpm --dir frontend test:run @RemainingArgs
    }
    "^(lint)$" {
        Write-Host "==> Running go vet..." -ForegroundColor Cyan
        go vet ./...
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Write-Host "==> Running frontend linter..." -ForegroundColor Cyan
        pnpm --dir frontend lint @RemainingArgs
    }
    "^(lint:fix)$" {
        pnpm --dir frontend lint:fix @RemainingArgs
    }
    "^(bindings|generate)$" {
        wails3 generate bindings -ts @RemainingArgs
    }
    "^(clean)$" {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue bin, build/bin, frontend/dist, frontend/coverage, .task
        Write-Host "Cleaned build artifacts." -ForegroundColor Green
    }
    "^(alias|setup-alias)$" {
        Write-Host "On Windows (PowerShell or cmd), typing 'kutex <command>' works directly"
        Write-Host "inside this repository directory."
        Write-Host ""
        Write-Host "To run 'kutex' from any directory, add this repository to your User PATH:"
        Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$RootDir', 'User')"
    }
    "^(help|-h|--help)$" {
        Write-Host "Kutex development runner"
        Write-Host ""
        Write-Host "Usage: .\kutex.ps1 <command> [args...]"
        Write-Host "   or: kutex <command> [args...]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  dev           Start development server with live reload (wails3 dev)"
        Write-Host "  build         Build production binary (wails3 build)"
        Write-Host "  package       Package native installer/bundle (wails3 task package)"
        Write-Host "  run           Run compiled application binary"
        Write-Host "  test          Run all tests (Go unit tests + frontend Vitest)"
        Write-Host "  test:go       Run Go unit tests only"
        Write-Host "  test:fe       Run frontend Vitest tests only"
        Write-Host "  lint          Run linters (go vet + ESLint)"
        Write-Host "  lint:fix      Run ESLint auto-fix"
        Write-Host "  bindings      Regenerate TypeScript bindings from Go services"
        Write-Host "  clean         Remove build artifacts and temporary files"
        Write-Host "  alias         Show how to enable typing 'kutex' from anywhere"
    }
    default {
        wails3 task $Command @RemainingArgs
    }
}
