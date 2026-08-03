@echo off
cd /d "%~dp0"
node ai-model-demo\server.js
echo.
echo AI demo server stopped. Press any key to close this window.
pause >nul
