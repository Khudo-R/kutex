@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=dev"
shift

if /i "%CMD%"=="dev" goto dev
if /i "%CMD%"=="build" goto build
if /i "%CMD%"=="package" goto package
if /i "%CMD%"=="run" goto run
if /i "%CMD%"=="test" goto test
if /i "%CMD%"=="test:go" goto test_go
if /i "%CMD%"=="test:fe" goto test_fe
if /i "%CMD%"=="test:frontend" goto test_fe
if /i "%CMD%"=="lint" goto lint
if /i "%CMD%"=="lint:fix" goto lint_fix
if /i "%CMD%"=="bindings" goto bindings
if /i "%CMD%"=="generate" goto bindings
if /i "%CMD%"=="clean" goto clean
if /i "%CMD%"=="alias" goto alias
if /i "%CMD%"=="help" goto help
if /i "%CMD%"=="-h" goto help
if /i "%CMD%"=="--help" goto help

wails3 task %CMD% %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:dev
wails3 dev -config ./build/config.yml -port 9245 %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:build
wails3 build %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:package
wails3 task package %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:run
wails3 task run %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:test
echo ==^> Running Go tests...
go test -v ./internal/...
if errorlevel 1 exit /b %errorlevel%
echo ==^> Running frontend tests...
call pnpm --dir frontend test:run %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:test_go
go test -v ./internal/... %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:test_fe
call pnpm --dir frontend test:run %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:lint
echo ==^> Running go vet...
go vet ./...
if errorlevel 1 exit /b %errorlevel%
echo ==^> Running frontend linter...
call pnpm --dir frontend lint %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:lint_fix
call pnpm --dir frontend lint:fix %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:bindings
wails3 generate bindings -ts %1 %2 %3 %4 %5 %6 %7 %8 %9
goto end

:clean
if exist bin rmdir /s /q bin
if exist build\bin rmdir /s /q build\bin
if exist frontend\dist rmdir /s /q frontend\dist
if exist frontend\coverage rmdir /s /q frontend\coverage
if exist .task rmdir /s /q .task
echo Cleaned build artifacts.
goto end

:alias
echo On Windows (cmd.exe or PowerShell), typing "kutex <command>" already works
echo directly in this directory because kutex.cmd and kutex.ps1 are in the folder.
echo.
echo To run "kutex" from ANY folder on Windows, add this directory to your User PATH:
echo   setx PATH "%%PATH%%;%SCRIPT_DIR%"
goto end

:help
echo Kutex development runner
echo.
echo Usage: kutex ^<command^> [args...]
echo.
echo Commands:
echo   dev           Start development server with live reload (wails3 dev)
echo   build         Build production binary (wails3 build)
echo   package       Package native installer/bundle (wails3 task package)
echo   run           Run compiled application binary
echo   test          Run all tests (Go unit tests + frontend Vitest)
echo   test:go       Run Go unit tests only
echo   test:fe       Run frontend Vitest tests only
echo   lint          Run linters (go vet + ESLint)
echo   lint:fix      Run ESLint auto-fix
echo   bindings      Regenerate TypeScript bindings from Go services
echo   clean         Remove build artifacts and temporary files
echo   alias         Show how to enable typing "kutex" from anywhere
goto end

:end
exit /b %errorlevel%
