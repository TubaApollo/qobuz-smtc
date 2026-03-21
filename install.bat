@echo off
setlocal

:: Qobuz SMTC Patch — Installer
::
:: Adds Windows System Media Transport Controls (SMTC) to Qobuz Desktop.
:: Shows track metadata, artwork, playback controls, and seek position
:: in the Windows media overlay, taskbar, and lock screen.
::
:: Usage:
::   install.bat                          Install (auto-detect Qobuz path)
::   install.bat "C:\path\to\Qobuz"      Install with custom path
::   install.bat --restore                Restore original files
::
:: Prerequisites:
::   - Node.js v16+ in PATH
::   - Qobuz Desktop installed
::   - Close Qobuz before running
::
:: The following files must be in the same directory as this script:
::   patch.js           Patcher (applies changes to main-win32.js and app.html)
::   smtc-main.js       Main process module (replaces empty SMTC stub)
::   smtc-renderer.js   Renderer module (sets up navigator.mediaSession)

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is required. Install it from https://nodejs.org
    pause
    exit /b 1
)

:: Check required files
for %%f in (patch.js smtc-main.js smtc-renderer.js) do (
    if not exist "%~dp0%%f" (
        echo Error: Missing file '%%f' in %~dp0
        pause
        exit /b 1
    )
)

:: Run patcher
node "%~dp0patch.js" %*

pause
