@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0Create-Codex-Pulse-Shortcuts.ps1"
if errorlevel 1 (
  echo Could not create shortcuts. Check that the package is fully extracted and the folders are writable.
  pause
  exit /b 1
)
echo You can now open Codex Pulse from your Desktop or Windows search.
pause
