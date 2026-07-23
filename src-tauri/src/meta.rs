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

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const STATE_VERSION: u32 = 1;

/// Expert binding for a session — records which expert was summoned.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertBinding {
    /// Expert id (marketplace id or local agent name).
    pub expert_id: String,
    /// Display name shown in the UI badge.
    pub expert_name: String,
    /// "marketplace" | "local".
    pub source: String,
    /// Local avatar image path (for the topbar/composer badge).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_local: Option<String>,
}

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
    /// Expert bindings: session_id → ExpertBinding.
    #[serde(default)]
    pub expert_sessions: HashMap<String, ExpertBinding>,
}

impl Default for OpenBuddyState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            pinned_sessions: Vec::new(),
            archived_sessions: Vec::new(),
            expert_sessions: HashMap::new(),
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

    /// Expert bindings map for merging into the session list.
    pub fn expert_map(&self) -> &HashMap<String, ExpertBinding> {
        &self.expert_sessions
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

/// Bind an expert to a session. Overwrites any previous binding for the same
/// session id. Returns `true` on success.
pub fn set_expert(session_id: &str, binding: ExpertBinding) -> Result<bool, String> {
    let mut state = read_state();
    state
        .expert_sessions
        .insert(session_id.to_string(), binding);
    write_state(&state)?;
    Ok(true)
}

/// Remove the expert binding for a session. Returns `true` if a binding was
/// removed, `false` if there was none.
pub fn clear_expert(session_id: &str) -> Result<bool, String> {
    let mut state = read_state();
    let removed = state.expert_sessions.remove(session_id).is_some();
    if removed {
        write_state(&state)?;
    }
    Ok(removed)
}

// ---------- unit tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    // --- OpenBuddyState::default ---

    #[test]
    fn default_state() {
        let state = OpenBuddyState::default();
        assert_eq!(state.version, 1);
        assert!(state.pinned_sessions.is_empty());
        assert!(state.archived_sessions.is_empty());
    }

    // --- pinned_set / archived_set ---

    #[test]
    fn pinned_set_converts_to_hashset() {
        let state = OpenBuddyState {
            version: 1,
            pinned_sessions: vec!["s1".into(), "s2".into(), "s1".into()],
            archived_sessions: vec![],
            expert_sessions: HashMap::new(),
        };
        let set = state.pinned_set();
        assert_eq!(set.len(), 2); // deduplicated
        assert!(set.contains("s1"));
        assert!(set.contains("s2"));
    }

    #[test]
    fn archived_set_converts_to_hashset() {
        let state = OpenBuddyState {
            version: 1,
            pinned_sessions: vec![],
            archived_sessions: vec!["a1".into(), "a2".into()],
            expert_sessions: HashMap::new(),
        };
        let set = state.archived_set();
        assert_eq!(set.len(), 2);
        assert!(set.contains("a1"));
        assert!(set.contains("a2"));
    }

    #[test]
    fn empty_sets() {
        let state = OpenBuddyState::default();
        assert!(state.pinned_set().is_empty());
        assert!(state.archived_set().is_empty());
    }

    // --- serde round-trip ---

    #[test]
    fn state_serde_roundtrip() {
        let state = OpenBuddyState {
            version: 1,
            pinned_sessions: vec!["s1".into()],
            archived_sessions: vec!["a1".into(), "a2".into()],
            expert_sessions: HashMap::new(),
        };
        let json = serde_json::to_string(&state).unwrap();
        let parsed: OpenBuddyState = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.pinned_sessions, vec!["s1"]);
        assert_eq!(parsed.archived_sessions, vec!["a1", "a2"]);
    }

    #[test]
    fn state_deserialize_with_missing_fields() {
        // Old format might not have all fields
        let json = r#"{"version":1}"#;
        let state: OpenBuddyState = serde_json::from_str(json).unwrap();
        assert!(state.pinned_sessions.is_empty());
        assert!(state.archived_sessions.is_empty());
    }

    // --- set_pinned / set_archived with GROK_HOME redirect ---
    // NOTE: These tests share the GROK_HOME env var, so they MUST run in a
    // single test function to avoid race conditions (cargo test runs tests
    // in parallel threads within the same process).

    #[test]
    fn set_pinned_and_archived_lifecycle() {
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("GROK_HOME", tmp.path());

        // --- pinned lifecycle ---
        // Pin
        let result = set_pinned("session-1", true).unwrap();
        assert!(result);
        let state = read_state();
        assert!(state.pinned_sessions.contains(&"session-1".to_string()));

        // Pin again (idempotent — no duplicate)
        let result = set_pinned("session-1", true).unwrap();
        assert!(result);
        let state = read_state();
        assert_eq!(state.pinned_sessions.iter().filter(|s| *s == "session-1").count(), 1);

        // Unpin
        let result = set_pinned("session-1", false).unwrap();
        assert!(!result);
        let state = read_state();
        assert!(!state.pinned_sessions.contains(&"session-1".to_string()));

        // Unpin again (idempotent)
        let result = set_pinned("session-1", false).unwrap();
        assert!(!result);

        // --- archived lifecycle ---
        // Archive
        let result = set_archived("session-2", true).unwrap();
        assert!(result);
        let state = read_state();
        assert!(state.archived_sessions.contains(&"session-2".to_string()));

        // Archive again (idempotent)
        let result = set_archived("session-2", true).unwrap();
        assert!(result);
        let state = read_state();
        assert_eq!(state.archived_sessions.iter().filter(|s| *s == "session-2").count(), 1);

        // Unarchive
        let result = set_archived("session-2", false).unwrap();
        assert!(!result);
        let state = read_state();
        assert!(!state.archived_sessions.contains(&"session-2".to_string()));

        std::env::remove_var("GROK_HOME");
    }
}
