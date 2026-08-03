@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "DESKTOP_DIR=%ROOT_DIR%\desktop-app"
set "NEU_PACKAGE=@neutralinojs/neu@11.7.0"

if not exist "%DESKTOP_DIR%\package.json" (
    echo [error] Could not find desktop-app\package.json.
    echo [error] Run this script from the repository checkout.
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [error] Node.js is required to build the Neutralino executable.
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [error] npm is required to build the Neutralino executable.
    exit /b 1
)

pushd "%DESKTOP_DIR%" || exit /b 1

if not exist "node_modules\.bin\neu.cmd" (
    echo [info] Installing Neutralino CLI %NEU_PACKAGE% locally...
    call npm install --no-save %NEU_PACKAGE%
    if errorlevel 1 (
        popd
        echo [error] Failed to install the Neutralino CLI.
        exit /b 1
    )
)

echo [info] Building MD-Editor desktop executable with Neutralino...
call npm run build
if errorlevel 1 (
    popd
    echo [error] Neutralino build failed.
    exit /b 1
)

echo.
echo [success] Build complete. Executable output:
if exist "dist" (
    for /r "dist" %%F in (*.exe) do echo   %%F
) else (
    echo   No dist directory was created.
)

popd
endlocal
