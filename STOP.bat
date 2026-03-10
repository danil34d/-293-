@echo off
chcp 65001 >nul 2>&1
title ZORIN Car Wash — Остановка
setlocal

set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\STOP.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Завершено с кодом %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
