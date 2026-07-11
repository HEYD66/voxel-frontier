@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Voxel Frontier Launcher

cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot enter the project directory: %~dp0
  pause
  exit /b 1
)

if not exist "%~dp0scripts\start-game.ps1" (
  echo [ERROR] Missing launcher helper: scripts\start-game.ps1
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-game.ps1" -ProjectRoot "%~dp0."
set "EXIT_CODE=%ERRORLEVEL%"

endlocal & exit /b %EXIT_CODE%
