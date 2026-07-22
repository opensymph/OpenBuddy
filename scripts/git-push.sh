#!/usr/bin/env bash
# ===========================================================================
#  Reliable git push for OpenBuddy
#
#  Avoids the two failure modes that bite this machine:
#    1. origin URL username mismatch vs Windows Credential Manager
#       (stored as opensymph@github.com, not simonchen@)
#    2. global insteadOf rewrite of https://github.com/ → ghproxy.net,
#       which breaks authenticated push (ghproxy has no creds).
#       Fix: always push via https://opensymph@github.com/... so the
#       insteadOf prefix "https://github.com/" does not match.
#
#  Usage:
#    bash scripts/git-push.sh                  # push current branch
#    bash scripts/git-push.sh --tags           # also push all local tags
#    bash scripts/git-push.sh v0.5.0           # push branch + specific tag(s)
#    bash scripts/git-push.sh --tags --force-with-lease
#
#  Env:
#    GIT_PUSH_REMOTE   remote name (default: origin)
#    GIT_PUSH_URL      override push URL entirely
# ===========================================================================

set -euo pipefail

log_ok()   { printf '  \033[32m[OK]\033[0m   %s\n' "$1"; }
log_warn() { printf '  \033[33m[WARN]\033[0m %s\n' "$1"; }
log_err()  { printf '  \033[31m[ERR]\033[0m  %s\n' "$1"; }
log_info() { printf '         %s\n' "$1"; }
log_step() { printf '\n\033[36m===> %s\033[0m\n' "$1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

REMOTE="${GIT_PUSH_REMOTE:-origin}"
PUSH_ALL_TAGS=0
FORCE_WITH_LEASE=0
TAGS=()
EXTRA_ARGS=()

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --tags) PUSH_ALL_TAGS=1; shift ;;
    --force-with-lease) FORCE_WITH_LEASE=1; shift ;;
    --remote)
      REMOTE="${2:?--remote requires a value}"
      shift 2
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    -*)
      log_err "unknown flag: $1"
      usage 1
      ;;
    *)
      TAGS+=("$1")
      shift
      ;;
  esac
done

# Canonical push URL that matches Credential Manager entry:
#   LegacyGeneric:target=git:https://opensymph@github.com
#
# Important: keep the userinfo (opensymph@). A bare
# https://github.com/... URL is rewritten by global insteadOf to
# ghproxy.net and then authenticated push fails.
DEFAULT_PUSH_URL="https://opensymph@github.com/opensymph/OpenBuddy.git"
PUSH_URL="${GIT_PUSH_URL:-$DEFAULT_PUSH_URL}"

normalize_push_url() {
  local url="$1"
  case "$url" in
    https://simonchen@github.com/opensymph/OpenBuddy.git|\
    https://github.com/opensymph/OpenBuddy.git|\
    https://ghproxy.net/https://github.com/opensymph/OpenBuddy.git|\
    https://gh-proxy.com/https://github.com/opensymph/OpenBuddy.git|\
    git@github.com:opensymph/OpenBuddy.git|\
    ssh://git@github.com/opensymph/OpenBuddy.git)
      printf '%s\n' "$DEFAULT_PUSH_URL"
      ;;
    *)
      printf '%s\n' "$url"
      ;;
  esac
}

PUSH_URL="$(normalize_push_url "$PUSH_URL")"

# Keep origin healthy so plain `git push` / fetch also work.
if git remote get-url "$REMOTE" >/dev/null 2>&1; then
  CURRENT="$(git remote get-url --push "$REMOTE" 2>/dev/null || git remote get-url "$REMOTE")"
  NORMALIZED="$(normalize_push_url "$CURRENT")"
  if [[ -n "$CURRENT" && "$CURRENT" != "$NORMALIZED" ]]; then
    log_step "Fixing $REMOTE URL"
    log_info "was: $CURRENT"
    git remote set-url "$REMOTE" "$NORMALIZED"
    log_ok "$REMOTE → $NORMALIZED"
  fi
  # Always push through the normalized URL (explicit), not the remote name.
  # Remote-name push can still pick up broken insteadOf in odd configs.
  PUSH_URL="$NORMALIZED"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  log_err "detached HEAD — checkout a branch before pushing"
  exit 1
fi

PUSH_FLAGS=()
if [[ "$FORCE_WITH_LEASE" -eq 1 ]]; then
  PUSH_FLAGS+=(--force-with-lease)
fi
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  PUSH_FLAGS+=("${EXTRA_ARGS[@]}")
fi

# Non-interactive: fail fast instead of hanging on credential popups.
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"
export GCM_INTERACTIVE="${GCM_INTERACTIVE:-never}"

log_step "Pushing branch '$BRANCH'"
log_info "url: $PUSH_URL"

git push "$PUSH_URL" "HEAD:refs/heads/$BRANCH" "${PUSH_FLAGS[@]+"${PUSH_FLAGS[@]}"}"
log_ok "branch $BRANCH pushed"

# Refresh remote-tracking ref so `git status` is accurate without a full fetch.
if git show-ref --verify --quiet "refs/remotes/$REMOTE/$BRANCH"; then
  git update-ref "refs/remotes/$REMOTE/$BRANCH" HEAD
fi

push_one_tag() {
  local tag="$1"
  if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    log_err "local tag not found: $tag"
    return 1
  fi
  log_step "Pushing tag $tag"
  git push "$PUSH_URL" "refs/tags/$tag"
  log_ok "tag $tag pushed"
}

if [[ ${#TAGS[@]} -gt 0 ]]; then
  for t in "${TAGS[@]}"; do
    push_one_tag "$t"
  done
fi

if [[ "$PUSH_ALL_TAGS" -eq 1 ]]; then
  log_step "Pushing all local tags"
  git push "$PUSH_URL" --tags
  log_ok "all tags pushed"
fi

log_step "Status"
git status -sb
log_ok "done"
