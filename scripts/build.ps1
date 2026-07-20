#Requires -Version 5.0
# ===========================================================================
#  OpenBuddy Windows packaging script (PowerShell)
#
#  Produces a distributable NSIS installer (.exe) via `pnpm tauri build`.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts/build.ps1
#    powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Version 0.2.0
#
#  Optional env vars:
#    GROK_BUILD_PATH  Override the absolute path to grok-build checkout.
#                     Defaults to E:/Grok/grok-build (the dev-machine path
#                     currently checked into Cargo.toml).
# ===========================================================================

[CmdletBinding()]
param(
    [string]$Version
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Log-Step([string]$msg) {
    Write-Host ""
    Write-Host "===> $msg" -ForegroundColor Cyan
}
function Log-Ok([string]$msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Log-Warn([string]$msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Log-Err([string]$msg)  { Write-Host "  [ERR]  $msg" -ForegroundColor Red }
function Log-Info([string]$msg) { Write-Host "         $msg" -ForegroundColor DarkGray }

# Track whether we rewrote Cargo.toml so the finally block can restore it.
$script:CargoTomlPath = Join-Path $ProjectRoot "src-tauri\Cargo.toml"
$script:CargoBackup   = $null
$script:RustToolchainPath = Join-Path $ProjectRoot "rust-toolchain.toml"
$script:RustToolchainBackup = $null

# ---------------------------------------------------------------------------
# 1. Version sync (optional)
# ---------------------------------------------------------------------------
if ($Version) {
    Log-Step "Syncing version -> $Version"
    $pkgJson = Join-Path $ProjectRoot "package.json"
    $tauriConf = Join-Path $ProjectRoot "src-tauri\tauri.conf.json"

    (Get-Content $pkgJson -Raw) -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$Version`"" |
        Set-Content $pkgJson -NoNewline
    (Get-Content $tauriConf -Raw) -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$Version`"" |
        Set-Content $tauriConf -NoNewline
    # Cargo.toml: only the first `version = "..."` under [package] (line ~3).
    $cargoLines = Get-Content $script:CargoTomlPath
    for ($i = 0; $i -lt $cargoLines.Length; $i++) {
        if ($cargoLines[$i] -match '^\s*version\s*=\s*"[^"]*"') {
            $cargoLines[$i] = 'version = "{0}"' -f $Version
            break
        }
    }
    $cargoLines | Set-Content $script:CargoTomlPath
    Log-Ok "Bumped version in package.json, tauri.conf.json, Cargo.toml"
}

# ---------------------------------------------------------------------------
# 2. Toolchain sanity check
# ---------------------------------------------------------------------------
Log-Step "Checking toolchain"
foreach ($cmd in @("pnpm", "cargo", "rustc")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Log-Err "$cmd not found on PATH."
        exit 1
    }
    $v = (Invoke-Expression "$cmd --version") 2>$null
    Log-Info ("{0,-7} {1}" -f $cmd, $v)
}
Log-Ok "Core tools present"

# ---------------------------------------------------------------------------
# 3. MSVC environment (cargo x86_64-pc-windows-msvc needs link.exe + SDK).
#    Reuses the same vcvars/vswhere dance as dev.bat.
# ---------------------------------------------------------------------------
Log-Step "Locating MSVC environment"
$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $instPath = & $vswhere -latest -products * -property installationPath 2>$null
        if ($instPath -and (Test-Path (Join-Path $instPath "VC\Auxiliary\Build\vcvars64.bat"))) {
            $vcvars = Join-Path $instPath "VC\Auxiliary\Build\vcvars64.bat"
        }
    }
}
if (-not (Test-Path $vcvars)) {
    Log-Err "vcvars64.bat not found."
    Log-Err "Install the 'Desktop development with C++' workload in Visual Studio or VS Build Tools."
    exit 1
}
Log-Info "Using: $vcvars"

# Run vcvars64.bat in a cmd subprocess and import its env into this session.
$envOut = & cmd /c "`"$vcvars`" >nul 2>&1 && set"
foreach ($line in $envOut) {
    if ($line -match '^([^=]+)=(.*)$') {
        Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
    }
}
if (-not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
    Log-Err "link.exe still not on PATH after vcvars."
    exit 1
}
Log-Ok "MSVC link.exe available: $((Get-Command link.exe).Source)"

# ---------------------------------------------------------------------------
# 4. grok-build path override (runtime Cargo.toml rewrite, restored on exit).
# ---------------------------------------------------------------------------
Log-Step "Resolving grok-build path"
$defaultGrok = "E:/Grok/grok-build"
$grokPath = $env:GROK_BUILD_PATH
if (-not $grokPath) { $grokPath = $defaultGrok }

if (-not (Test-Path $grokPath)) {
    Log-Err "grok-build not found at: $grokPath"
    Log-Err "Set `$env:GROK_BUILD_PATH to your grok-build checkout and retry."
    exit 1
}
$grokPath = ($grokPath -replace '\\', '/').TrimEnd('/')
Log-Info "grok-build: $grokPath"

if ($grokPath -ne $defaultGrok) {
    Log-Info "Rewriting grok-build path deps in Cargo.toml (will restore on exit)"
    $script:CargoBackup = Get-Content $script:CargoTomlPath -Raw
    $new = $script:CargoBackup `
        -replace 'path\s*=\s*"E:/Grok/grok-build/crates/codegen/xai-acp-lib"', "path = `"$grokPath/crates/codegen/xai-acp-lib`"" `
        -replace 'path\s*=\s*"E:/Grok/grok-build/crates/codegen/xai-grok-shell"', "path = `"$grokPath/crates/codegen/xai-grok-shell`""
    Set-Content $script:CargoTomlPath -Value $new -NoNewline
    Log-Ok "Cargo.toml grok path deps -> $grokPath"
} else {
    Log-Ok "grok-build matches default path, no Cargo.toml rewrite needed"
}

# ---------------------------------------------------------------------------
# 5. NSIS tool cache (work around GitHub download timeouts in CN).
#    Pre-place nsis-3.11 + nsis_tauri_utils.dll in Tauri's cache so the
#    bundler skips its own (often failing) download.
#
#    Tauri's expected layout (flat — zip's top-level nsis-3.11/ prefix is
#    stripped on extract):
#      %LOCALAPPDATA%\tauri\NSIS\makensis.exe
#      %LOCALAPPDATA%\tauri\NSIS\Plugins\x86-unicode\additional\nsis_tauri_utils.dll
# ---------------------------------------------------------------------------
Log-Step "Ensuring NSIS tool cache"
$nsisCacheRoot = Join-Path $env:LOCALAPPDATA "tauri\NSIS"
$makensis      = Join-Path $nsisCacheRoot "makensis.exe"

if (Test-Path $makensis) {
    Log-Ok "NSIS cache hit: $makensis"
} else {
    Log-Info "NSIS not cached; downloading via gh-proxy mirror"
    $tmpDir = Join-Path $env:TEMP "openbuddy-nsis-prep"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

    $nsisZipUrl = "https://gh-proxy.com/https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip"
    $dllUrl     = "https://gh-proxy.com/https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
    $nsisZip    = Join-Path $tmpDir "nsis-3.11.zip"
    $utilsDll   = Join-Path $tmpDir "nsis_tauri_utils.dll"

    $expectedZipHash = "EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D"
    $expectedDllHash = "75197FEE3C6A814FE035788D1C34EAD39349B860"

    # Helper: download a URL to a file with up to 2 attempts, verifying SHA1.
    # Mirrors occasionally return truncated/corrupt content, so verify + retry.
    function Download-Verified([string]$url, [string]$outPath, [string]$expectedSha1, [string]$label) {
        for ($attempt = 1; $attempt -le 2; $attempt++) {
            if (Test-Path $outPath) { Remove-Item $outPath -Force }
            try {
                Log-Info "Fetching $label (attempt $attempt)"
                Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing -ErrorAction Stop
            } catch {
                Log-Warn "$label attempt $attempt network error: $($_.Exception.Message)"
                continue
            }
            $hash = (Get-FileHash $outPath -Algorithm SHA1).Hash
            if ($hash -eq $expectedSha1) {
                Log-Ok "$label verified (SHA1 $hash)"
                return $true
            }
            Log-Warn "$label SHA1 mismatch: got $hash expected $expectedSha1"
        }
        # All attempts failed; remove the corrupt file so we don't leave junk.
        if (Test-Path $outPath) { Remove-Item $outPath -Force }
        return $false
    }

    $downloadOk = $true
    try {
        $zipOk = Download-Verified $nsisZipUrl $nsisZip $expectedZipHash "nsis-3.11.zip"
        $dllOk = Download-Verified $dllUrl     $utilsDll $expectedDllHash "nsis_tauri_utils.dll"
        $downloadOk = $zipOk -and $dllOk

        if ($downloadOk) {
            if (Test-Path $nsisCacheRoot) { Remove-Item $nsisCacheRoot -Recurse -Force }
            # Extract to a staging dir first, then flatten the nsis-3.11/ prefix
            # so files land directly under $nsisCacheRoot (matching Tauri's layout).
            $staging = Join-Path $tmpDir "nsis-extract"
            if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
            Expand-Archive -Path $nsisZip -DestinationPath $staging -Force
            New-Item -ItemType Directory -Force -Path $nsisCacheRoot | Out-Null
            $inner = Join-Path $staging "nsis-3.11"
            Copy-Item -Path (Join-Path $inner "*") -Destination $nsisCacheRoot -Recurse -Force

            # nsis_tauri_utils.dll goes under an `additional` subdir (Tauri's convention).
            $pluginDir = Join-Path $nsisCacheRoot "Plugins\x86-unicode\additional"
            New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
            Copy-Item $utilsDll -Destination $pluginDir -Force
            if (Test-Path $makensis) {
                Log-Ok "NSIS cached at $makensis"
            } else {
                Log-Warn "Extraction looked OK but makensis.exe still missing; Tauri will retry."
            }
        } else {
            Log-Warn "Mirror download/verification failed after retries."
            Log-Warn "Continuing; Tauri will attempt its own download next."
        }
    } catch {
        Log-Warn "Mirror setup threw: $($_.Exception.Message)"
        Log-Warn "Continuing; Tauri will attempt its own download next."
    }
}

# ---------------------------------------------------------------------------
# 6. Build (frontend build runs automatically via beforeBuildCommand).
# ---------------------------------------------------------------------------
Log-Step "Building NSIS installer (pnpm tauri build --bundles nsis)"
try {
    & pnpm tauri build --bundles nsis
    $buildExit = $LASTEXITCODE
} catch {
    Log-Err "pnpm tauri build threw: $($_.Exception.Message)"
    $buildExit = 1
}

# ---------------------------------------------------------------------------
# 7. Report artifacts.
# ---------------------------------------------------------------------------
$bundleDir = Join-Path $ProjectRoot "src-tauri\target\release\bundle\nsis"
if ($buildExit -eq 0 -and (Test-Path $bundleDir)) {
    Log-Step "Build succeeded. Artifacts:"
    Get-ChildItem $bundleDir -Filter *.exe | ForEach-Object {
        $sizeMb = "{0:N1}" -f ($_.Length / 1MB)
        Log-Ok ("{0,-40} {1} MB" -f $_.Name, $sizeMb)
        Log-Info $_.FullName
    }
} else {
    Log-Err "Build failed (exit $buildExit). See output above."
}

# Always restore Cargo.toml so the working tree stays clean.
if ($script:CargoBackup) {
    Set-Content $script:CargoTomlPath -Value $script:CargoBackup -NoNewline
    Write-Host ""
    Log-Info "Restored Cargo.toml to original content."
}

if ($buildExit -ne 0) { exit $buildExit }
