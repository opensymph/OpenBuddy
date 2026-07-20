#!/usr/bin/env bash
# ===========================================================================
#  OpenBuddy macOS packaging script (bash)
#
#  Produces a distributable .dmg via `pnpm tauri build --bundles dmg`.
#  Builds for the host architecture (Apple Silicon or Intel); Tauri picks
#  the right target automatically.
#
#  Usage:
#    bash scripts/build.sh
#    bash scripts/build.sh --version 0.2.0
#
#  Optional env vars:
#    GROK_BUILD_PATH  Override the absolute path to grok-build checkout.
#                     Defaults to ~/Grok/grok-build.
#
#  NOTE on code signing / notarization:
#    This script intentionally does NOT sign or notarize the bundle.
#    Unsigned .dmg/.app will run on the build machine but will prompt
#    "unidentified developer" elsewhere (right-click > Open to bypass).
#    Setting up signing is a separate task requiring an Apple Developer ID.
# ===========================================================================

set -euo pipefail

# ---- helpers --------------------------------------------------------------
log_step() { printf '\n\033[36m===> %s\033[0m\n' "$1"; }
log_ok()   { printf '  \033[32m[OK]\033[0m   %s\n' "$1"; }
log_warn() { printf '  \033[33m[WARN]\033[0m %s\n' "$1"; }
log_err()  { printf '  \033[31m[ERR]\033[0m  %s\n' "$1"; }
log_info() { printf '         %s\n' "$1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Files we may temporarily rewrite; tracked so the EXIT trap can restore them.
CARGO_TOML="$PROJECT_ROOT/src-tauri/Cargo.toml"
RUST_TC="$PROJECT_ROOT/rust-toolchain.toml"
CARGO_BAK=""
RUST_TC_BAK=""

# ---------------------------------------------------------------------------
# Restore any files we mutated. Runs on normal exit, error, or Ctrl+C.
# ---------------------------------------------------------------------------
cleanup() {
    local rc=$?
    if [[ -n "$CARGO_BAK" ]]; then
        mv -f "$CARGO_BAK" "$CARGO_TOML"
        log_info "Restored Cargo.toml."
    fi
    if [[ -n "$RUST_TC_BAK" ]]; then
        mv -f "$RUST_TC_BAK" "$RUST_TC"
        log_info "Restored rust-toolchain.toml."
    fi
    exit $rc
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# 1. Parse args
# ---------------------------------------------------------------------------
NEW_VERSION=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            NEW_VERSION="${2:-}"
            if [[ -z "$NEW_VERSION" ]]; then
                log_err "--version requires a value"
                exit 1
            fi
            shift 2
            ;;
        -h|--help)
            sed -n '2,28p' "$0"
            exit 0
            ;;
        *)
            log_err "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# 2. Platform + toolchain checks
# ---------------------------------------------------------------------------
log_step "Checking platform"
if [[ "$(uname -s)" != "Darwin" ]]; then
    log_err "This script targets macOS. On Windows use scripts/build.ps1 instead."
    exit 1
fi
ARCH="$(uname -m)"
log_ok "macOS detected ($ARCH)"

log_step "Checking toolchain"
for cmd in pnpm cargo rustc; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_err "$cmd not found on PATH."
        exit 1
    fi
    log_info "$(printf '%-7s %s' "$cmd" "$("$cmd" --version 2>/dev/null | head -1)")"
done

# grok's build.rs invokes protoc; honor $PROTOC or a protoc on PATH.
if [[ -z "${PROTOC:-}" ]] && ! command -v protoc >/dev/null 2>&1; then
    log_err "protoc not found. Install protobuf (brew install protobuf) or set PROTOC=/path/to/protoc."
    exit 1
fi
log_ok "protoc available via ${PROTOC:-PATH}"
log_ok "Core tools present"

# ---------------------------------------------------------------------------
# 3. Version sync (optional)
# ---------------------------------------------------------------------------
if [[ -n "$NEW_VERSION" ]]; then
    log_step "Syncing version -> $NEW_VERSION"
    PKG_JSON="$PROJECT_ROOT/package.json"
    Tauri_CONF="$PROJECT_ROOT/src-tauri/tauri.conf.json"
    # sed -i behaves differently on GNU vs BSD; use a temp file for portability.
    sed -E "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PKG_JSON" > "$PKG_JSON.tmp" && mv "$PKG_JSON.tmp" "$PKG_JSON"
    sed -E "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$Tauri_CONF" > "$Tauri_CONF.tmp" && mv "$Tauri_CONF.tmp" "$Tauri_CONF"
    # Cargo.toml: only replace the first `version = "..."` (under [package]).
    awk -v v="$NEW_VERSION" '
        !done && /^[[:space:]]*version[[:space:]]*=/ { sub(/"[^"]*"/, "\"" v "\""); done=1 }
        { print }
    ' "$CARGO_TOML" > "$CARGO_TOML.tmp" && mv "$CARGO_TOML.tmp" "$CARGO_TOML"
    log_ok "Bumped version in package.json, tauri.conf.json, Cargo.toml"
fi

# ---------------------------------------------------------------------------
# 4. grok-build path override (runtime Cargo.toml rewrite).
# ---------------------------------------------------------------------------
log_step "Resolving grok-build path"
DEFAULT_GROK="$HOME/Grok/grok-build"
GROK_PATH="${GROK_BUILD_PATH:-$DEFAULT_GROK}"
if [[ ! -d "$GROK_PATH" ]]; then
    log_err "grok-build not found at: $GROK_PATH"
    log_err "Set GROK_BUILD_PATH=/path/to/grok-build and retry."
    exit 1
fi
# Normalize: forward slashes, no trailing slash.
GROK_PATH="$(cd "$GROK_PATH" && pwd | sed 's#/#/#g')"
log_info "grok-build: $GROK_PATH"

# Cargo.toml currently hardcodes the Windows dev path. Rewrite it for this run.
log_info "Rewriting grok-build path deps in Cargo.toml (will restore on exit)"
CARGO_BAK="$CARGO_TOML.bak.$$"
cp "$CARGO_TOML" "$CARGO_BAK"
# Match the literal Windows path regardless of host, replace with $GROK_PATH.
sed -E "s#path[[:space:]]*=[[:space:]]*\"E:/Grok/grok-build/crates/codegen/xai-acp-lib\"#path = \"$GROK_PATH/crates/codegen/xai-acp-lib\"#; \
        s#path[[:space:]]*=[[:space:]]*\"E:/Grok/grok-build/crates/codegen/xai-grok-shell\"#path = \"$GROK_PATH/crates/codegen/xai-grok-shell\"#" \
    "$CARGO_BAK" > "$CARGO_TOML"
log_ok "Cargo.toml grok path deps -> $GROK_PATH"

# ---------------------------------------------------------------------------
# 5. rust-toolchain.toml pins windows-msvc host; on macOS that triggers an
#    unwanted toolchain install. Side-step it for this run.
# ---------------------------------------------------------------------------
if [[ -f "$RUST_TC" ]]; then
    log_info "Temporarily disabling rust-toolchain.toml (pins windows-msvc)"
    RUST_TC_BAK="$RUST_TC.bak.$$"
    mv "$RUST_TC" "$RUST_TC_BAK"
fi

# ---------------------------------------------------------------------------
# 6. Build (frontend build runs automatically via beforeBuildCommand).
# ---------------------------------------------------------------------------
log_step "Building .dmg (pnpm tauri build --bundles dmg)"
BUILD_RC=0
pnpm tauri build --bundles dmg || BUILD_RC=$?

# ---------------------------------------------------------------------------
# 7. Report artifacts.
# ---------------------------------------------------------------------------
BUNDLE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg"
if [[ $BUILD_RC -eq 0 && -d "$BUNDLE_DIR" ]]; then
    log_step "Build succeeded. Artifacts:"
    while IFS= read -r -d '' f; do
        size_mb=$(du -m "$f" | cut -f1)
        log_ok "$(basename "$f")  (${size_mb} MB)"
        log_info "$f"
    done < <(find "$BUNDLE_DIR" -name '*.dmg' -print0)
else
    log_err "Build failed (exit $BUILD_RC). See output above."
fi

exit $BUILD_RC
