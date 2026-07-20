#Requires -Version 5.0
# ===========================================================================
#  OpenBuddy one-time setup (Windows)
#
#  Initializes the vendor/grok-build submodule after a fresh clone.
#  Idempotent: safe to re-run.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
# ===========================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Log-Step([string]$msg) { Write-Host ""; Write-Host "===> $msg" -ForegroundColor Cyan }
function Log-Ok([string]$msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Log-Warn([string]$msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Log-Err([string]$msg)  { Write-Host "  [ERR]  $msg" -ForegroundColor Red }
function Log-Info([string]$msg) { Write-Host "         $msg" -ForegroundColor DarkGray }

# Pinned grok-build revision. The Cargo path deps + src-tauri Rust code are
# written against this version's API. If you bump it, expect to adjust code.
$PinnedRev = "98c3b2438aa922fbbe6178a5c0a4c48f85edc8ce"

# ---------------------------------------------------------------------------
# 1. Initialize submodule
# ---------------------------------------------------------------------------
Log-Step "Initializing grok-build submodule"
git submodule update --init --recursive vendor/grok-build
Log-Ok "vendor/grok-build ready"

# ---------------------------------------------------------------------------
# 2. Verify pinned revision (warn, don't fail — allows intentional bumps)
# ---------------------------------------------------------------------------
$currentRev = git -C vendor/grok-build rev-parse HEAD
if ($currentRev -ne $PinnedRev) {
    Log-Warn "grok-build is at $currentRev"
    Log-Warn "expected $PinnedRev — src-tauri code may be out of sync with this revision."
    Log-Warn "if this is an intentional bump, update PinnedRev in scripts/setup.ps1."
} else {
    Log-Ok "grok-build at pinned revision $PinnedRev"
}

# ---------------------------------------------------------------------------
# 3. Apply patches/grok-build/*.patch (idempotent).
#    Required: upstream's xai-proto-build uses /dev/stdout + /dev/null which
#    don't exist on Windows; these patches reroute protoc to a temp file.
#    On already-patched checkouts `git apply --check --reverse` succeeds and
#    we skip, so re-running setup is safe.
# ---------------------------------------------------------------------------
$patchDir = Join-Path $ProjectRoot "patches\grok-build"
if (Test-Path $patchDir) {
    Get-ChildItem $patchDir -Filter *.patch | Sort-Object Name | ForEach-Object {
        $patch = $_.FullName
        # Already applied? (reverse-apply check succeeds)
        git -C vendor\grok-build apply --check --reverse $patch 2>$null
        if ($LASTEXITCODE -eq 0) {
            Log-Ok "$($_.Name) already applied, skipping"
            return
        }
        # Applicable fresh?
        git -C vendor\grok-build apply --check $patch 2>$null
        if ($LASTEXITCODE -eq 0) {
            git -C vendor\grok-build apply $patch
            Log-Ok "applied $($_.Name)"
        } else {
            Log-Warn "$($_.Name) did not apply cleanly - skipping (may already be merged upstream)"
        }
    }
}

Log-Step "Setup complete"
Log-Info "Next:"
Log-Info "  pnpm install"
Log-Info "  pnpm dev            # or: powershell -File scripts\build.ps1"
