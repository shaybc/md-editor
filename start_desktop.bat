@echo off
setlocal

if /i "%~1"=="--pull" git pull
cd /d "%~dp0desktop-app"
call undeploy_desktop.bat
npm run dev
