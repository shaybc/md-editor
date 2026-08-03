@echo off
setlocal

cd /d "%~dp0desktop-app"
set "NEEDS_INSTALL="

if not exist "node_modules\" set "NEEDS_INSTALL=1"

if defined NEEDS_INSTALL (
    echo [setup] Installing desktop app dependencies...
    call npm install
    if errorlevel 1 exit /b %errorlevel%
)

call npm run prod
exit /b %errorlevel%
