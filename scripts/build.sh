#!/usr/bin/env bash
# ===========================================================================
#  OpenBuddy Unix packaging script (macOS / Linux)
#
#  Produces a distributable installer with Tauri:
#    - macOS: .dmg by default
#    - Linux: .deb by default
#
#  Usage:
#    bash scripts/build.sh
#    bash scripts/build.sh --version 0.2.0
#    bash scripts/build.sh --bundles deb
#    bash scripts/build.sh --bundles dmg
#
#  Prerequisites:
#    Run `scripts/setup.sh` once after clone to initialize the
#    vendor/grok-build submodule.
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
# (Cargo.toml is no longer rewritten — grok-build path deps are now relative
#  to the submodule at vendor/grok-build.)
CARGO_TOML="$PROJECT_ROOT/src-tauri/Cargo.toml"
RUST_TC="$PROJECT_ROOT/rust-toolchain.toml"
RUST_TC_BAK=""

# ---------------------------------------------------------------------------
# Restore any files we mutated. Runs on normal exit, error, or Ctrl+C.
# ---------------------------------------------------------------------------
cleanup() {
    local rc=$?
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
BUNDLES=""
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
        --bundles|-b)
            BUNDLES="${2:-}"
            if [[ -z "$BUNDLES" ]]; then
                log_err "--bundles requires a value"
                exit 1
            fi
            shift 2
            ;;
        -h|--help)
            sed -n '2,31p' "$0"
            exit 0
            ;;
        *)
            log_err "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# 2. Platform + default bundle selection
# ---------------------------------------------------------------------------
log_step "Checking platform"
UNAME_S="$(uname -s)"
case "$UNAME_S" in
    Darwin)
        PLATFORM_NAME="macOS"
        DEFAULT_BUNDLES="dmg"
        ;;
    Linux)
        PLATFORM_NAME="Linux"
        DEFAULT_BUNDLES="deb"
        ;;
    *)
        log_err "Unsupported platform: $UNAME_S. Use scripts/build.ps1 on Windows."
        exit 1
        ;;
esac
ARCH="$(uname -m)"
if [[ -z "$BUNDLES" ]]; then
    BUNDLES="$DEFAULT_BUNDLES"
fi
log_ok "$PLATFORM_NAME detected ($ARCH); bundles: $BUNDLES"

# rust-toolchain.toml pins a Windows MSVC host; on Unix hosts that triggers an
# unwanted or invalid toolchain install. Side-step it before probing cargo/rustc.
if [[ -f "$RUST_TC" ]]; then
    log_info "Temporarily disabling rust-toolchain.toml (pins Windows MSVC)"
    RUST_TC_BAK="$RUST_TC.bak.$$"
    mv "$RUST_TC" "$RUST_TC_BAK"
fi

bundle_enabled() {
    local needle="$1"
    local part
    local IFS=','
    read -ra parts <<< "$BUNDLES"
    for part in "${parts[@]}"; do
        part="${part//[[:space:]]/}"
        if [[ "$part" == "$needle" || "$part" == "all" ]]; then
            return 0
        fi
    done
    return 1
}

# ---------------------------------------------------------------------------
# 3. Toolchain checks
# ---------------------------------------------------------------------------
log_step "Checking toolchain"
for cmd in pnpm cargo rustc; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_err "$cmd not found on PATH."
        case "$cmd" in
            pnpm)
                log_info "Install Node 20+ and pnpm first."
                ;;
            cargo|rustc)
                log_info "Install Rust stable first: https://rustup.rs/"
                ;;
        esac
        exit 1
    fi
    log_info "$(printf '%-7s %s' "$cmd" "$("$cmd" --version 2>/dev/null | head -1)")"
done

# grok's build.rs invokes protoc; prefer $PROTOC, otherwise export the PATH copy.
if [[ -n "${PROTOC:-}" ]]; then
    if [[ -x "$PROTOC" ]] || command -v "$PROTOC" >/dev/null 2>&1; then
        log_ok "protoc available via PROTOC=$PROTOC"
    else
        log_err "PROTOC is set but not executable: $PROTOC"
        exit 1
    fi
elif command -v protoc >/dev/null 2>&1; then
    export PROTOC="$(command -v protoc)"
    log_ok "PROTOC=$PROTOC"
else
    log_err "protoc not found. Install protobuf or set PROTOC=/path/to/protoc."
    log_info "Ubuntu/Debian: sudo apt install -y protobuf-compiler"
    log_info "macOS: brew install protobuf"
    exit 1
fi
log_ok "Core tools present"

check_linux_dependencies() {
    [[ "$PLATFORM_NAME" == "Linux" ]] || return 0

    log_step "Checking Linux build dependencies"
    local missing_cmds=()
    local missing_pkg_configs=()

    for cmd in pkg-config; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_cmds+=("$cmd")
        fi
    done

    if bundle_enabled deb && ! command -v dpkg-deb >/dev/null 2>&1; then
        missing_cmds+=("dpkg-deb")
    fi

    if [[ ${#missing_cmds[@]} -eq 0 ]]; then
        local pkg
        for pkg in webkit2gtk-4.1 gtk+-3.0 ayatana-appindicator3-0.1 librsvg-2.0 openssl; do
            if ! pkg-config --exists "$pkg"; then
                missing_pkg_configs+=("$pkg")
            fi
        done
    fi

    if [[ ${#missing_cmds[@]} -gt 0 || ${#missing_pkg_configs[@]} -gt 0 ]]; then
        log_err "Missing Linux dependencies."
        if [[ ${#missing_cmds[@]} -gt 0 ]]; then
            log_info "Missing commands: ${missing_cmds[*]}"
        fi
        if [[ ${#missing_pkg_configs[@]} -gt 0 ]]; then
            log_info "Missing pkg-config packages: ${missing_pkg_configs[*]}"
        fi
        log_info "Ubuntu/Debian:"
        log_info "  sudo apt update"
        log_info "  sudo apt install -y build-essential curl wget file pkg-config dpkg-dev libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev protobuf-compiler"
        exit 1
    fi

    log_ok "Linux build dependencies present"
}
check_linux_dependencies

# ---------------------------------------------------------------------------
# 4. Version sync (optional)
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
# 5. grok-build submodule sanity check (path deps in Cargo.toml are relative
#    to vendor/grok-build, so the submodule must be present) + ensure the
#    protoc patch is applied (idempotent).
# ---------------------------------------------------------------------------
log_step "Checking grok-build submodule"
GROK_SUBMODULE="$PROJECT_ROOT/vendor/grok-build"
if ! git -C "$GROK_SUBMODULE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_err "grok-build submodule not initialized at: $GROK_SUBMODULE"
    log_err "Run \`scripts/setup.sh\` (or \`git submodule update --init vendor/grok-build\`) and retry."
    exit 1
fi
log_ok "grok-build submodule present: $GROK_SUBMODULE"

PATCH_DIR="$PROJECT_ROOT/patches/grok-build"
if [[ -d "$PATCH_DIR" ]]; then
    for p in "$PATCH_DIR"/*.patch; do
        [[ -f "$p" ]] || continue
        if git -C "$GROK_SUBMODULE" apply --check --reverse "$p" 2>/dev/null; then
            log_ok "$(basename "$p") already applied"
        elif git -C "$GROK_SUBMODULE" apply --check "$p" 2>/dev/null; then
            git -C "$GROK_SUBMODULE" apply "$p"
            log_ok "applied $(basename "$p")"
        else
            log_warn "$(basename "$p") did not apply cleanly — skipping"
        fi
    done
fi

# ---------------------------------------------------------------------------
# 6. Build (frontend build runs automatically via beforeBuildCommand).
# ---------------------------------------------------------------------------
log_step "Building bundles: $BUNDLES (pnpm tauri build --bundles $BUNDLES)"
BUILD_RC=0
pnpm tauri build --bundles "$BUNDLES" || BUILD_RC=$?

# ---------------------------------------------------------------------------
# 7. Report artifacts.
# ---------------------------------------------------------------------------
BUNDLE_ROOT="$PROJECT_ROOT/src-tauri/target/release/bundle"
FOUND_ARTIFACTS=0
report_bundle_artifacts() {
    local bundle="$1"
    local ext="$2"
    local dir="$BUNDLE_ROOT/$bundle"
    [[ -d "$dir" ]] || return 0
    while IFS= read -r -d '' f; do
        size_mb=$(du -m "$f" | cut -f1)
        log_ok "$(basename "$f")  (${size_mb} MB)"
        log_info "$f"
        FOUND_ARTIFACTS=1
    done < <(find "$dir" -maxdepth 1 -type f -name "$ext" -print0)
}

if [[ $BUILD_RC -eq 0 ]]; then
    log_step "Build succeeded. Artifacts:"
    report_bundle_artifacts dmg '*.dmg'
    report_bundle_artifacts deb '*.deb'
    report_bundle_artifacts appimage '*.AppImage'
    if [[ $FOUND_ARTIFACTS -eq 0 ]]; then
        log_warn "No bundle artifacts found under $BUNDLE_ROOT"
    fi
else
    log_err "Build failed (exit $BUILD_RC). See output above."
fi

exit $BUILD_RC
