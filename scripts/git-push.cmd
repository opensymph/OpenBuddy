@echo off
REM Windows entrypoint for scripts/git-push.sh (uses Git Bash).
setlocal
set "BASH="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not defined BASH (
  where bash >nul 2>nul && set "BASH=bash"
)
if not defined BASH (
  echo [ERR] Git Bash not found. Install Git for Windows or run: bash scripts/git-push.sh
  exit /b 1
)
"%BASH%" "%~dp0git-push.sh" %*
