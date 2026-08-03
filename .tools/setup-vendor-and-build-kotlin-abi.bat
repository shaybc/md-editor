@echo off
setlocal EnableExtensions

rem Sets up the desktop vendor packages and rebuilds the Kotlin ABI JAR.
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

if not exist "%ROOT_DIR%\desktop-app\package.json" (
    echo [error] Could not find desktop-app\package.json.
    echo [error] Run this script from the repository checkout.
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [error] npm is required to set up the desktop vendor packages.
    exit /b 1
)

pushd "%ROOT_DIR%" || exit /b 1

echo [info] Downloading and installing the desktop vendor packages...
call npm --prefix desktop-app run setup
if errorlevel 1 (
    popd
    echo [error] Desktop vendor setup failed.
    exit /b 1
)

echo [info] Rebuilding the Kotlin ABI JAR...
call npm --prefix desktop-app run build:kotlin-jdt-extension
if errorlevel 1 (
    popd
    echo [error] Kotlin ABI JAR build failed.
    exit /b 1
)

popd
echo [success] Desktop vendor setup and Kotlin ABI JAR build completed.
endlocal
