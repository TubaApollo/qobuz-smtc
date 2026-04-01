@echo off
setlocal

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is required. Install it from https://nodejs.org
    pause
    exit /b 1
)

for %%f in (patch.js smtc-main.js) do (
    if not exist "%~dp0%%f" (
        echo Error: Missing file '%%f' in %~dp0
        pause
        exit /b 1
    )
)

echo.
echo  Qobuz SMTC Native Patch
echo  ========================
echo.
echo  NOTE: This tool modifies your local Qobuz installation.
echo  This may violate the Qobuz Terms of Service.
echo  Use at your own risk. No warranty.
echo.
echo  ---------------------------------------------------------
echo.
echo  [1] Use prebuild (fast, no compiler needed)
echo      Uses the included smtc_native.node
echo      Built for Electron 32.3.3 / Qobuz 8.1.0
echo.
echo  [2] Build from source (recommended, requires VS Build Tools)
echo      Compiles the .node matching your Qobuz version
echo.
echo  [3] Remove patch (restore original files)
echo.

choice /C 123 /N /M "Choose [1/2/3]: "

if %errorlevel%==3 goto restore
if %errorlevel%==2 goto build
if %errorlevel%==1 goto prebuild

:prebuild
if not exist "%~dp0prebuilds\smtc_native.node" (
    echo.
    echo Error: prebuilds\smtc_native.node not found.
    pause
    exit /b 1
)
echo.
echo Using prebuild...
if not exist "%~dp0build\Release" mkdir "%~dp0build\Release"
copy /Y "%~dp0prebuilds\smtc_native.node" "%~dp0build\Release\smtc_native.node" >nul
echo.
node "%~dp0patch.js" %*
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Patch failed. Is Qobuz still running?
    echo Close Qobuz and try again.
    pause
    exit /b 1
)
echo.
echo [SUCCESS] Patch applied. Start Qobuz to use SMTC.
pause
exit /b 0

:build
if not exist "%~dp0node_modules" (
    echo.
    echo Installing dependencies...
    cd /d "%~dp0"
    npm install --ignore-scripts
)
echo.
echo Building native SMTC addon...
node "%~dp0scripts\build-for-qobuz.js" %*
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Are VS Build Tools installed?
    echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
    pause
    exit /b 1
)
echo.
node "%~dp0patch.js" %*
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Patch failed. Is Qobuz still running?
    echo Close Qobuz and try again.
    pause
    exit /b 1
)
echo.
echo [SUCCESS] Patch applied. Start Qobuz to use SMTC.
pause
exit /b 0

:restore
echo.
node "%~dp0patch.js" --restore
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Restore failed.
    pause
    exit /b 1
)
echo.
echo [SUCCESS] Original files restored.
pause
exit /b 0
