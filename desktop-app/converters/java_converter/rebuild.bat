@echo off
setlocal

pushd "%~dp0" || exit /b 1
call mvn clean package
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
