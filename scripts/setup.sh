#!/usr/bin/env bash
# ===========================================================================
#  OpenBuddy one-time setup (macOS / Linux)
#
#  Initializes the vendor/grok-build submodule after a fresh clone.
#  Idempotent: safe to re-run.
#
#  Usage:
#    bash scripts/setup.sh
# ===========================================================================

set -euo pipefail

log_step() { printf '\n\033[36m===> %s\033[0m\n' "$1"; }
log_ok()   { printf '  \033[32m[OK]\033[0m   %s\n' "$1"; }
log_warn() { printf '  \033[33m[WARN]\033[0m %s\n' "$1"; }
log_err()  { printf '  \033[31m[ERR]\033[0m  %s\n' "$1"; }
log_info() { printf '         %s\n' "$1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Pinned grok-build revision. The Cargo path deps + src-tauri Rust code are
# written against this version's API. If you bump it, expect to adjust code.
PINNED_REV="a881e6703f46b01d8c7d4a5437683546df30449d"

# ---------------------------------------------------------------------------
# 1. Initialize submodule
# ---------------------------------------------------------------------------
log_step "Initializing grok-build submodule"
git submodule update --init --recursive vendor/grok-build
log_ok "vendor/grok-build ready"

# ---------------------------------------------------------------------------
# 2. Verify pinned revision (warn, don't fail — allows intentional bumps)
# ---------------------------------------------------------------------------
CURRENT_REV="$(git -C vendor/grok-build rev-parse HEAD)"
if [[ "$CURRENT_REV" != "$PINNED_REV" ]]; then
    log_warn "grok-build is at $CURRENT_REV"
    log_warn "expected $PINNED_REV — src-tauri code may be out of sync with this revision."
    log_warn "if this is an intentional bump, update PINNED_REV in scripts/setup.sh."
else
    log_ok "grok-build at pinned revision $PINNED_REV"
fi

# ---------------------------------------------------------------------------
# 3. Apply patches/grok-build/*.patch (idempotent).
#    Required: upstream's xai-proto-build uses /dev/stdout + /dev/null which
#    don't exist on Windows; these patches reroute protoc to a temp file.
#    On already-patched checkouts `git apply --check --reverse` succeeds and
#    we skip, so re-running setup is safe.
# ---------------------------------------------------------------------------
PATCH_DIR="$PROJECT_ROOT/patches/grok-build"
if [[ -d "$PATCH_DIR" ]]; then
    for p in "$PATCH_DIR"/*.patch; do
        [[ -f "$p" ]] || continue
        # Already applied? (reverse-apply check succeeds)
        if git -C vendor/grok-build apply --check --reverse "$p" 2>/dev/null; then
            log_ok "$(basename "$p") already applied, skipping"
            continue
        fi
        # Applicable fresh?
        if git -C vendor/grok-build apply --check "$p" 2>/dev/null; then
            git -C vendor/grok-build apply "$p"
            log_ok "applied $(basename "$p")"
        else
            log_warn "$(basename "$p") did not apply cleanly — skipping (may already be merged upstream)"
        fi
    done
fi

log_step "Setup complete"
log_info "Next:"
log_info "  pnpm install"
log_info "  pnpm dev            # or: bash scripts/build.sh"
