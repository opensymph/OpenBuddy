//! OpenBuddy's own metadata sidecar.
//!
//! grok's `summary.json` (and the in-memory `Summary` it serializes) does NOT
//! support a `pinned` field — it only knows its own schema, and writing an
//! unknown key would be clobbered the next time grok flushes. So we keep
//! OpenBuddy-only state (currently: pinned + archived sessions) in a separate file:
//! `~/.grok/openbuddy-state.json`.
//!
//! Read on every `list_sessions` call and merged into the per-session
//! `SessionSummary`. The shape is intentionally a small versioned object so
//! we can extend it later (starred, hidden, custom tags, …) without a
//! migration.

use std::collections::HashSet;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const STATE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenBuddyState {
    /// Schema version for forward compatibility.
    pub version: u32,
    /// Session ids the user pinned to the top of the sidebar.
    #[serde(default)]
    pub pinned_sessions: Vec<String>,
    /// Session ids the user archived (hidden from the sidebar).
    #[serde(default)]
    pub archived_sessions: Vec<String>,
}

impl Default for OpenBuddyState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            pinned_sessions: Vec::new(),
            archived_sessions: Vec::new(),
        }
    }
}

impl OpenBuddyState {
    /// Snapshot of pinned ids as a `HashSet` for O(1) membership checks when
    /// merging into the session list.
    pub fn pinned_set(&self) -> HashSet<String> {
        self.pinned_sessions.iter().cloned().collect()
    }

    /// Snapshot of archived ids as a `HashSet` for O(1) membership checks when
    /// filtering the session list.
    pub fn archived_set(&self) -> HashSet<String> {
        self.archived_sessions.iter().cloned().collect()
    }
}

/// Resolve `~/.grok` (or `$GROK_HOME`). Matches `sessions.rs` / `providers.rs`.
fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

fn state_path() -> PathBuf {
    grok_home().join("openbuddy-state.json")
}

/// Read OpenBuddy state. Missing/corrupt → default (we never block startup on
/// sidecar state; a corrupt file is left in place rather than rewritten so the
/// user can recover it manually if needed).
pub fn read_state() -> OpenBuddyState {
    let Ok(content) = std::fs::read_to_string(state_path()) else {
        return OpenBuddyState::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Atomic write: tmp file in the same dir, then rename. Mirrors
/// `providers::write_config` semantics — falls back to direct write if rename
/// fails (e.g. antivirus on Windows).
fn write_state(state: &OpenBuddyState) -> Result<(), String> {
    let path = state_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create state dir: {e}"))?;
    }
    let body = serde_json::to_string_pretty(state).map_err(|e| format!("serialize state: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &body).map_err(|e| format!("write state tmp: {e}"))?;
    if std::fs::rename(&tmp, &path).is_err() {
        std::fs::write(&path, &body).map_err(|e| format!("write state: {e}"))?;
    }
    Ok(())
}

/// Set the pinned flag for one session. Returns the new pinned state so the
/// command layer can echo it back to the frontend.
pub fn set_pinned(session_id: &str, pinned: bool) -> Result<bool, String> {
    let mut state = read_state();
    let set = state.pinned_set();
    let already = set.contains(session_id);
    if pinned && !already {
        state.pinned_sessions.push(session_id.to_string());
    } else if !pinned && already {
        state.pinned_sessions.retain(|s| s != session_id);
    } else {
        // No change — still return the desired state without touching disk.
        return Ok(pinned);
    }
    write_state(&state)?;
    Ok(pinned)
}

/// Set the archived flag for one session. Returns the new archived state so
/// the command layer can echo it back to the frontend.
pub fn set_archived(session_id: &str, archived: bool) -> Result<bool, String> {
    let mut state = read_state();
    let set = state.archived_set();
    let already = set.contains(session_id);
    if archived && !already {
        state.archived_sessions.push(session_id.to_string());
    } else if !archived && already {
        state.archived_sessions.retain(|s| s != session_id);
    } else {
        // No change — still return the desired state without touching disk.
        return Ok(archived);
    }
    write_state(&state)?;
    Ok(archived)
}
