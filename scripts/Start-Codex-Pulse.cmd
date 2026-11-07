@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0CodexPulse.exe" (
  echo CodexPulse.exe is missing. Extract the complete portable archive first.
  pause
  exit /b 1
)
if not defined PULSE_DATA_DIR set "PULSE_DATA_DIR=%~dp0data"
start "" "%~dp0CodexPulse.exe"
