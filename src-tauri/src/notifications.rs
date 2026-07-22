//! OpenBuddy notification log — a local inbox for grok events.
//!
//! WorkBuddy's "智能体邮箱" (agent mailbox) is a Tencent email integration
//! (send/receive mail, turn emails into tasks). grok has no email backend,
//! so OpenBuddy redefines this tab as a **session notification center**:
//! every interesting grok event (permission request, folder-trust prompt,
//! task completion, plan-mode toggle, MCP status change, session summary) is
//! appended here as a notification the user can browse, filter, and act on.
//!
//! Storage: `~/.grok/openbuddy-notifications.json` (capped at 200 entries;
//! older entries drop off FIFO).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;

/// Notification kind. Mirrors the grok event channels we already subscribe to.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
    Permission,
    FolderTrust,
    TaskUpdate,
    PlanMode,
    McpStatus,
    ModelsUpdate,
    Summary,
    SessionComplete,
    Error,
    Info,
}

impl NotificationKind {
    fn from_str(s: &str) -> Self {
        match s {
            "permission" => Self::Permission,
            "folder_trust" | "folder-trust" => Self::FolderTrust,
            "task_update" | "task-update" => Self::TaskUpdate,
            "plan_mode" | "plan-mode" => Self::PlanMode,
            "mcp_status" | "mcp-status" => Self::McpStatus,
            "models_update" | "models-update" => Self::ModelsUpdate,
            "summary" => Self::Summary,
            "session_complete" | "complete" => Self::SessionComplete,
            "error" => Self::Error,
            _ => Self::Info,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationEntry {
    /// Monotonic id (timestamp-based).
    pub id: u64,
    pub kind: NotificationKind,
    /// ISO timestamp.
    pub at: String,
    /// Human-readable title.
    pub title: String,
    /// Optional detail/body (raw event JSON or short text).
    #[serde(default)]
    pub body: Option<String>,
    /// Optional related session id (for permission/summary/etc.).
    #[serde(default)]
    pub session_id: Option<String>,
    /// Severity: "info" | "warn" | "error".
    #[serde(default = "default_severity")]
    pub severity: String,
    /// Whether the user has dismissed/read this entry.
    #[serde(default)]
    pub read: bool,
}

fn default_severity() -> String {
    "info".into()
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct NotificationStore {
    #[serde(default)]
    pub entries: Vec<NotificationEntry>,
}

const MAX_ENTRIES: usize = 200;

fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

fn store_path() -> PathBuf {
    grok_home().join("openbuddy-notifications.json")
}

/// Read the notification log. Missing/corrupt → empty.
pub fn read_store() -> NotificationStore {
    let Ok(content) = std::fs::read_to_string(store_path()) else {
        return NotificationStore::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Atomic write.
fn write_store(store: &NotificationStore) -> Result<(), String> {
    let path = store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    let body = serde_json::to_string_pretty(store)
        .map_err(|e| format!("serialize notifications: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &body).map_err(|e| format!("write tmp: {e}"))?;
    if std::fs::rename(&tmp, &path).is_err() {
        std::fs::write(&path, &body).map_err(|e| format!("write notifications: {e}"))?;
    }
    Ok(())
}

/// Append a notification. Called by the frontend (via command) when it
/// receives a grok event it wants logged. Caps the log at MAX_ENTRIES.
pub fn append(kind: NotificationKind, title: &str, body: Option<&str>, session_id: Option<&str>, severity: &str) {
    let mut store = read_store();
    let id = store
        .entries
        .last()
        .map(|e| e.id + 1)
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(1)
        });
    let at = chrono::Local::now().to_rfc3339();
    store.entries.push(NotificationEntry {
        id,
        kind,
        at,
        title: title.to_string(),
        body: body.map(String::from),
        session_id: session_id.map(String::from),
        severity: severity.to_string(),
        read: false,
    });
    // FIFO cap.
    if store.entries.len() > MAX_ENTRIES {
        let excess = store.entries.len() - MAX_ENTRIES;
        store.entries.drain(0..excess);
    }
    let _ = write_store(&store);
}

// ---------- Tauri commands ----------

/// Append a notification (frontend calls this when it receives a grok event).
#[tauri::command]
pub fn notification_append(
    _state: State<'_, AppState>,
    kind: String,
    title: String,
    body: Option<String>,
    session_id: Option<String>,
    severity: Option<String>,
) {
    append(
        NotificationKind::from_str(&kind),
        &title,
        body.as_deref(),
        session_id.as_deref(),
        severity.as_deref().unwrap_or("info"),
    );
}

/// List notifications (newest first).
#[tauri::command]
pub fn notification_list(_state: State<'_, AppState>) -> Vec<NotificationEntry> {
    let mut entries = read_store().entries;
    entries.reverse();
    entries
}

/// Mark a notification as read.
#[tauri::command]
pub fn notification_mark_read(_state: State<'_, AppState>, id: u64) -> Result<(), String> {
    let mut store = read_store();
    for e in &mut store.entries {
        if e.id == id {
            e.read = true;
        }
    }
    write_store(&store)
}

/// Mark all as read.
#[tauri::command]
pub fn notification_mark_all_read(_state: State<'_, AppState>) -> Result<(), String> {
    let mut store = read_store();
    for e in &mut store.entries {
        e.read = true;
    }
    write_store(&store)
}

/// Clear all notifications.
#[tauri::command]
pub fn notification_clear(_state: State<'_, AppState>) -> Result<(), String> {
    write_store(&NotificationStore::default())
}

// ---------- unit tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    // --- NotificationKind::from_str ---

    #[test]
    fn kind_from_str_known_variants() {
        assert!(matches!(NotificationKind::from_str("permission"), NotificationKind::Permission));
        assert!(matches!(NotificationKind::from_str("folder_trust"), NotificationKind::FolderTrust));
        assert!(matches!(NotificationKind::from_str("folder-trust"), NotificationKind::FolderTrust));
        assert!(matches!(NotificationKind::from_str("task_update"), NotificationKind::TaskUpdate));
        assert!(matches!(NotificationKind::from_str("task-update"), NotificationKind::TaskUpdate));
        assert!(matches!(NotificationKind::from_str("plan_mode"), NotificationKind::PlanMode));
        assert!(matches!(NotificationKind::from_str("plan-mode"), NotificationKind::PlanMode));
        assert!(matches!(NotificationKind::from_str("mcp_status"), NotificationKind::McpStatus));
        assert!(matches!(NotificationKind::from_str("mcp-status"), NotificationKind::McpStatus));
        assert!(matches!(NotificationKind::from_str("models_update"), NotificationKind::ModelsUpdate));
        assert!(matches!(NotificationKind::from_str("models-update"), NotificationKind::ModelsUpdate));
        assert!(matches!(NotificationKind::from_str("summary"), NotificationKind::Summary));
        assert!(matches!(NotificationKind::from_str("session_complete"), NotificationKind::SessionComplete));
        assert!(matches!(NotificationKind::from_str("complete"), NotificationKind::SessionComplete));
        assert!(matches!(NotificationKind::from_str("error"), NotificationKind::Error));
    }

    #[test]
    fn kind_from_str_unknown_falls_back_to_info() {
        assert!(matches!(NotificationKind::from_str("unknown"), NotificationKind::Info));
        assert!(matches!(NotificationKind::from_str(""), NotificationKind::Info));
        assert!(matches!(NotificationKind::from_str("PERMISSION"), NotificationKind::Info));
    }

    // --- default_severity ---

    #[test]
    fn default_severity_is_info() {
        assert_eq!(default_severity(), "info");
    }

    // --- NotificationStore serde ---

    #[test]
    fn store_default_is_empty() {
        let store = NotificationStore::default();
        assert!(store.entries.is_empty());
    }

    #[test]
    fn entry_serde_roundtrip() {
        let entry = NotificationEntry {
            id: 42,
            kind: NotificationKind::Permission,
            at: "2026-07-01T10:00:00+08:00".into(),
            title: "Test notification".into(),
            body: Some("details".into()),
            session_id: Some("sess-1".into()),
            severity: "warn".into(),
            read: false,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let parsed: NotificationEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, 42);
        assert_eq!(parsed.title, "Test notification");
        assert_eq!(parsed.severity, "warn");
        assert!(!parsed.read);
    }

    #[test]
    fn entry_deserialize_defaults() {
        // Missing optional fields should use defaults.
        // Note: serde rename_all = "camelCase" so variant is "info" not "Info".
        let json = r#"{"id":1,"kind":"info","at":"2026-01-01","title":"hi"}"#;
        let entry: NotificationEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.severity, "info");
        assert!(!entry.read);
        assert!(entry.body.is_none());
        assert!(entry.session_id.is_none());
    }
}
