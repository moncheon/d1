@echo off
setlocal
cd /d "%~dp0"
title Quokka Pipe Cleaner - Local Web Build

if not exist "release\web\index.html" (
  echo [ERROR] release\web\index.html is missing.
  echo Run "pnpm build" once on a development PC, then copy the whole project folder again.
  pause
  exit /b 1
)

echo Starting the same static files used for web deployment...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve-release.ps1"
set "launcher_exit=%errorlevel%"

if not "%launcher_exit%"=="0" (
  echo.
  echo The local web server stopped with exit code %launcher_exit%.
  pause
)

exit /b %launcher_exit%
