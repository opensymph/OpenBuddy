@echo off
REM ===========================================================================
REM  OpenBuddy dev launcher (Windows)
REM
REM  Double-click this file to start `pnpm tauri dev` with the MSVC build
REM  environment pre-loaded. tauri dev is long-running: Ctrl+C in this window
REM  or closing the OpenBuddy app window will stop it.
REM
REM  Why this exists: cargo's `x86_64-pc-windows-msvc` target needs MSVC
REM  `link.exe` + the Windows SDK on PATH. A plain CMD/Git Bash terminal does
REM  not have them, so cargo falls back to Git Bash's `/usr/bin/link` (GNU
REM  coreutils) and fails with `link: extra operand`. This script invokes
REM  vcvars64.bat first to set up the environment, then runs pnpm tauri dev.
REM
REM  If vcvars64.bat moves (different VS edition/year), update VCVARS below.
REM ===========================================================================

setlocal

set "VSCMD_START_DIR=%CD%"
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

REM Locate vcvars64.bat: check the known BuildTools path first, then fall back
REM to a vswhere query so this keeps working if VS edition changes.
if not exist "%VCVARS%" (
    for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath`) do (
        if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
    )
)

if not exist "%VCVARS%" (
    echo [dev.bat] ERROR: could not find vcvars64.bat.
    echo [dev.bat] Install "Desktop development with C++" workload in Visual Studio
    echo [dev.bat] or VS Build Tools, then edit VCVARS in this script.
    pause
    exit /b 1
)

echo [dev.bat] Loading MSVC environment: %VCVARS%
call "%VCVARS%" >nul
if errorlevel 1 (
    echo [dev.bat] ERROR: vcvars64.bat failed.
    pause
    exit /b 1
)

REM Sanity-check that MSVC link.exe (not Git Bash's) is now first on PATH.
where /q link.exe
if errorlevel 1 (
    echo [dev.bat] ERROR: link.exe not found after vcvars.
    pause
    exit /b 1
)

echo [dev.bat] link.exe:
where link.exe

REM Switch to this script's directory (project root) regardless of where it
REM was launched from, so double-clicking from Explorer works.
cd /d "%~dp0"

echo [dev.bat] Starting: pnpm tauri dev
echo [dev.bat] (Ctrl+C here, or close the OpenBuddy window, to stop)
echo.

pnpm tauri dev

REM If tauri dev exits immediately (e.g. error), keep the window open so the
REM message is readable when launched by double-click.
if errorlevel 1 (
    echo.
    echo [dev.bat] tauri dev exited with error %ERRORLEVEL%.
    pause
)

endlocal
