//! Higher-level grok admin extensions — bridges the `x.ai/*` methods that
//! drive WorkBuddy-equivalent features:
//!
//! - **Memory** (资料库): read/rewrite `~/.grok/memory/MEMORY.md` + per-cwd
//!   workspace memory. `x.ai/memory/{flush,rewrite}` + `compact_conversation`.
//! - **Session search** (历史检索): `x.ai/session/search` over grok's FTS5.
//! - **Rewind** (回溯): `x.ai/rewind/{execute,points}`.
//! - **Prompt history** (命令面板): `x.ai/prompt_history`.
//! - **Slash commands** ("/ 调用技能与指令"): `x.ai/commands/list`.
//! - **Session fork/info/close**: `x.ai/session/{fork,info,close}`.
//! - **Plan mode toggle**: `x.ai/toggle_plan_mode` (notification both ways).
//! - **Folder trust**: `x.ai/folder_trust/request` responses.
//! - **Subagent / task observation**: `x.ai/{subagent,task}/*`.
//!
//! All ACP calls go through `ext::call_ext` / `call_ext_value`. File-backed
//! reads (memory markdown) go through direct fs (grok doesn't expose list).

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;
use crate::ext::{call_ext, raw_params};

// ========================================================================
// Memory (资料库)
// ========================================================================

/// One memory note. grok stores memories as markdown chunks; we surface the
/// raw text plus which scope it came from.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    /// "global" (~/.grok/memory/) or "workspace" (<cwd>/.grok/memory/).
    pub scope: String,
    /// Relative path under the memory root (e.g. "MEMORY.md" or "facts/rust.md").
    pub path: String,
    /// Raw markdown contents.
    pub content: String,
    /// Byte size (for display).
    pub size: u64,
}

fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

fn global_memory_dir() -> PathBuf {
    grok_home().join("memory")
}

fn workspace_memory_dir(cwd: &str) -> PathBuf {
    PathBuf::from(cwd).join(".grok").join("memory")
}

/// Recursively scan a memory dir for `*.md` files. Best-effort.
fn scan_memory_dir(dir: &std::path::Path, scope: &str) -> Vec<MemoryEntry> {
    let mut out = Vec::new();
    let Ok(stack_root) = dir.canonicalize() else {
        return out;
    };
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            let Ok(rel) = path.strip_prefix(&stack_root) else {
                continue;
            };
            let size = content.len() as u64;
            out.push(MemoryEntry {
                scope: scope.to_string(),
                path: rel.to_string_lossy().replace('\\', "/"),
                content,
                size,
            });
        }
    }
    // Stable order: global MEMORY.md first, then alphabetical.
    out.sort_by(|a, b| {
        let ag = a.path == "MEMORY.md";
        let bg = b.path == "MEMORY.md";
        bg.cmp(&ag).then_with(|| a.path.cmp(&b.path))
    });
    out
}

/// List memory notes from both global (`~/.grok/memory/`) and the current
/// workspace (`<cwd>/.grok/memory/`). grok auto-writes these as it learns
/// facts across sessions.
#[tauri::command]
pub fn memory_list(cwd: Option<String>) -> Vec<MemoryEntry> {
    let mut out = scan_memory_dir(&global_memory_dir(), "global");
    if let Some(cwd) = cwd {
        let ws_dir = workspace_memory_dir(&cwd);
        if ws_dir.exists() {
            out.extend(scan_memory_dir(&ws_dir, "workspace"));
        }
    }
    out
}

/// Read a single memory file. `scope` selects the root; `path` is relative.
#[tauri::command]
pub fn memory_get(scope: String, path: String, cwd: Option<String>) -> Result<String, String> {
    let root = match scope.as_str() {
        "workspace" => workspace_memory_dir(cwd.as_deref().ok_or("cwd required for workspace scope")?),
        _ => global_memory_dir(),
    };
    // Prevent path traversal: reject absolute paths and `..`.
    if path.starts_with('/') || path.starts_with('\\') || path.contains("..") {
        return Err("invalid memory path".into());
    }
    let full = root.join(&path);
    std::fs::read_to_string(&full).map_err(|e| format!("read {}: {e}", full.display()))
}

/// Create or overwrite a memory note. Writes to the selected scope's root.
#[tauri::command]
pub fn memory_save(
    scope: String,
    path: String,
    content: String,
    cwd: Option<String>,
) -> Result<MemoryEntry, String> {
    let root = match scope.as_str() {
        "workspace" => workspace_memory_dir(cwd.as_deref().ok_or("cwd required for workspace scope")?),
        _ => global_memory_dir(),
    };
    if path.starts_with('/') || path.starts_with('\\') || path.contains("..") {
        return Err("invalid memory path".into());
    }
    let full = root.join(&path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    let size = content.len() as u64;
    std::fs::write(&full, &content).map_err(|e| format!("write: {e}"))?;
    Ok(MemoryEntry {
        scope,
        path,
        content,
        size,
    })
}

/// Delete a memory note.
#[tauri::command]
pub fn memory_delete(scope: String, path: String, cwd: Option<String>) -> Result<(), String> {
    let root = match scope.as_str() {
        "workspace" => workspace_memory_dir(cwd.as_deref().ok_or("cwd required for workspace scope")?),
        _ => global_memory_dir(),
    };
    if path.starts_with('/') || path.starts_with('\\') || path.contains("..") {
        return Err("invalid memory path".into());
    }
    let full = root.join(&path);
    std::fs::remove_file(&full).map_err(|e| format!("delete: {e}"))
}

/// Trigger grok to rewrite memories into structured markdown via an LLM pass.
/// Maps to `x.ai/memory/rewrite`. Optional — the user can also just edit the
/// raw MEMORY.md themselves.
#[tauri::command]
pub async fn memory_rewrite(state: State<'_, AppState>) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    let _: serde_json::Value = call_ext(&tx, "x.ai/memory/rewrite", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Flush in-flight memory writes to disk (`x.ai/memory/flush`).
#[tauri::command]
pub async fn memory_flush(state: State<'_, AppState>) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    let _: serde_json::Value = call_ext(&tx, "x.ai/memory/flush", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========================================================================
// Session search (FTS5)
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub session_id: String,
    pub cwd: Option<String>,
    pub title: Option<String>,
    /// Snippet of matched content (FTS5 highlights).
    pub snippet: Option<String>,
    /// Match rank (lower = better).
    pub rank: Option<f64>,
    pub updated_at: Option<String>,
}

/// `x.ai/session/search` response shape (defensive — varies by grok version).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum SearchResponse {
    Results {
        #[serde(default, alias = "results")]
        results: Vec<RawSearchHit>,
    },
    Hits(Vec<RawSearchHit>),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSearchHit {
    session_id: String,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
    #[serde(default)]
    rank: Option<f64>,
    #[serde(default)]
    updated_at: Option<String>,
}

/// Full-text search across all sessions (grok's SQLite FTS5 index).
/// `cwd` optionally narrows to one workspace.
#[tauri::command]
pub async fn session_search(
    state: State<'_, AppState>,
    query: String,
    cwd: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({
        "query": query,
        "cwd": cwd,
        "limit": limit.unwrap_or(50),
        "offset": 0,
        "includeContent": true,
    });
    let params = raw_params(&payload);
    let resp: SearchResponse = call_ext(&tx, "x.ai/session/search", params)
        .await
        .map_err(|e| e.to_string())?;
    let raw = match resp {
        SearchResponse::Results { results } => results,
        SearchResponse::Hits(v) => v,
    };
    Ok(raw
        .into_iter()
        .map(|h| SearchHit {
            session_id: h.session_id,
            cwd: h.cwd,
            title: h.title,
            snippet: h.snippet,
            rank: h.rank,
            updated_at: h.updated_at,
        })
        .collect())
}

// ========================================================================
// Rewind (回溯到指定 prompt 索引)
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewindPoint {
    pub prompt_index: u32,
    pub prompt_preview: Option<String>,
    pub timestamp: Option<String>,
    /// First assistant response snippet (for timeline display).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_preview: Option<String>,
    /// Whether this prompt produced file changes (for badge display).
    #[serde(default)]
    pub has_file_changes: bool,
    /// Whether this prompt produced memory writes (for badge display).
    #[serde(default)]
    pub has_memory_changes: bool,
    /// Tool calls made during this turn (for timeline detail).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_names: Option<Vec<String>>,
}

/// List the prompts a session can rewind to.
#[tauri::command]
pub async fn rewind_points(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<RewindPoint>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "sessionId": session_id }));
    let v: serde_json::Value = call_ext(&tx, "x.ai/rewind/points", params)
        .await
        .map_err(|e| e.to_string())?;
    // Response shape: array or { points: [...] }.
    let arr = v.get("points").and_then(|p| p.as_array()).or_else(|| v.as_array());
    let Some(arr) = arr else { return Ok(Vec::new()); };
    Ok(arr
        .iter()
        .map(|item| {
            serde_json::from_value::<RewindPoint>(item.clone()).unwrap_or_else(|_| {
                let prompt_index = item
                    .get("promptIndex")
                    .or_else(|| item.get("prompt_index"))
                    .and_then(|n| n.as_u64())
                    .unwrap_or(0) as u32;
                let prompt_preview = item
                    .get("promptPreview")
                    .or_else(|| item.get("prompt_preview"))
                    .and_then(|s| s.as_str())
                    .map(String::from);
                let timestamp = item
                    .get("timestamp")
                    .and_then(|s| s.as_str())
                    .map(String::from);
                let message_preview = item
                    .get("messagePreview")
                    .or_else(|| item.get("message_preview"))
                    .and_then(|s| s.as_str())
                    .map(String::from);
                let has_file_changes = item
                    .get("hasFileChanges")
                    .or_else(|| item.get("has_file_changes"))
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);
                let has_memory_changes = item
                    .get("hasMemoryChanges")
                    .or_else(|| item.get("has_memory_changes"))
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);
                let tool_names = item
                    .get("toolNames")
                    .or_else(|| item.get("tool_names"))
                    .and_then(|a| a.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    });
                RewindPoint {
                    prompt_index,
                    prompt_preview,
                    timestamp,
                    message_preview,
                    has_file_changes,
                    has_memory_changes,
                    tool_names,
                }
            })
        })
        .collect())
}

/// Rewind a session to a specific prompt index. `mode` ∈ "all" (default) |
/// "conversation" (don't touch files) | "files".
#[tauri::command]
pub async fn rewind_execute(
    state: State<'_, AppState>,
    session_id: String,
    target_prompt_index: u32,
    mode: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({
        "sessionId": session_id,
        "targetPromptIndex": target_prompt_index,
        "mode": mode.unwrap_or_else(|| "all".into()),
        "force": force.unwrap_or(false),
    });
    let params = raw_params(&payload);
    let _: serde_json::Value = call_ext(&tx, "x.ai/rewind/execute", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========================================================================
// Session fork / info
// ========================================================================

/// Fork a session: copy its history to a new session id so the user can
/// explore a different direction. Returns the new session id.
#[tauri::command]
pub async fn session_fork(
    state: State<'_, AppState>,
    session_id: String,
    cwd: Option<String>,
) -> Result<String, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "sessionId": session_id, "cwd": cwd }));
    let v: serde_json::Value = call_ext(&tx, "x.ai/session/fork", params)
        .await
        .map_err(|e| e.to_string())?;
    // Response: { sessionId: "..." } or bare string.
    if let Some(id) = v.get("sessionId").and_then(|s| s.as_str()) {
        return Ok(id.to_string());
    }
    if let Some(id) = v.as_str() {
        return Ok(id.to_string());
    }
    Err("fork response missing sessionId".into())
}

// ========================================================================
// Slash commands + prompt history
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub argument_hint: Option<String>,
    /// Source: "builtin" | "skill" | "plugin".
    #[serde(default)]
    pub source: Option<String>,
}

/// List slash commands grok knows (builtin + skills + plugins). Powers the
/// Composer's "/" autocomplete.
#[tauri::command]
pub async fn commands_list(state: State<'_, AppState>) -> Result<Vec<SlashCommand>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    let v: serde_json::Value = call_ext(&tx, "x.ai/commands/list", params)
        .await
        .map_err(|e| e.to_string())?;
    let arr = v.get("commands").and_then(|c| c.as_array()).or_else(|| v.as_array());
    let Some(arr) = arr else { return Ok(Vec::new()); };
    Ok(arr
        .iter()
        .filter_map(|item| {
            Some(SlashCommand {
                name: item.get("name")?.as_str()?.to_string(),
                description: item.get("description").and_then(|s| s.as_str()).map(String::from),
                argument_hint: item
                    .get("argumentHint")
                    .or_else(|| item.get("argument_hint"))
                    .and_then(|s| s.as_str())
                    .map(String::from),
                source: item.get("source").and_then(|s| s.as_str()).map(String::from),
            })
        })
        .collect())
}

/// Cross-session prompt history (for the Composer's ↑ history dropdown and
/// the command palette).
#[tauri::command]
pub async fn prompt_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<String>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({ "limit": limit.unwrap_or(100) });
    let params = raw_params(&payload);
    let v: serde_json::Value = call_ext(&tx, "x.ai/prompt_history", params)
        .await
        .map_err(|e| e.to_string())?;
    // Response: array of strings or { prompts: [...] } or { history: [...] }.
    let arr = v
        .get("prompts")
        .or_else(|| v.get("history"))
        .and_then(|x| x.as_array())
        .or_else(|| v.as_array());
    let Some(arr) = arr else { return Ok(Vec::new()); };
    Ok(arr
        .iter()
        .filter_map(|item| {
            item.as_str()
                .map(String::from)
                .or_else(|| item.get("text").and_then(|s| s.as_str()).map(String::from))
        })
        .collect())
}

// ========================================================================
// Subagent / background task observation
// ========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningTask {
    pub id: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
}

/// List running background tasks / subagents. Powers a "running tasks" panel.
#[tauri::command]
pub async fn tasks_list(state: State<'_, AppState>) -> Result<Vec<RunningTask>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    // Try task/list first; some grok builds only expose subagent/list_running.
    let v: serde_json::Value = match call_ext(&tx, "x.ai/task/list", params.clone()).await {
        Ok(v) => v,
        Err(_) => call_ext(&tx, "x.ai/subagent/list_running", params)
            .await
            .map_err(|e| e.to_string())?,
    };
    let arr = v.get("tasks").or_else(|| v.get("subagents")).and_then(|x| x.as_array()).or_else(|| v.as_array());
    let Some(arr) = arr else { return Ok(Vec::new()); };
    Ok(arr
        .iter()
        .filter_map(|item| {
            Some(RunningTask {
                id: item
                    .get("id")
                    .or_else(|| item.get("taskId"))
                    .or_else(|| item.get("subagentId"))
                    .and_then(|s| s.as_str())?
                    .to_string(),
                kind: item.get("kind").and_then(|s| s.as_str()).map(String::from),
                description: item
                    .get("description")
                    .and_then(|s| s.as_str())
                    .map(String::from),
                status: item.get("status").and_then(|s| s.as_str()).map(String::from),
                session_id: item
                    .get("sessionId")
                    .and_then(|s| s.as_str())
                    .map(String::from),
            })
        })
        .collect())
}

/// Kill a running background task or subagent.
#[tauri::command]
pub async fn task_kill(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "taskId": task_id }));
    // Prefer task/kill, fall back to subagent/cancel.
    if call_ext::<serde_json::Value>(&tx, "x.ai/task/kill", params.clone())
        .await
        .is_ok()
    {
        return Ok(());
    }
    let subagent_params = raw_params(&serde_json::json!({ "subagentId": task_id }));
    let _: serde_json::Value = call_ext(&tx, "x.ai/subagent/cancel", subagent_params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========================================================================
// Folder trust
// ========================================================================

/// When grok sends `x.ai/folder_trust/request`, the frontend shows a dialog.
/// The user's decision is sent back via this command, which calls the grok
/// ext method `x.ai/folder_trust/respond` (or the ACP-standard permission
/// resolution path). The request itself is registered by bridge.rs.
#[tauri::command]
pub async fn folder_trust_respond(
    state: State<'_, AppState>,
    cwd: String,
    trusted: bool,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({ "cwd": cwd, "trusted": trusted });
    let params = raw_params(&payload);
    // Best-effort: method name varies; if folder_trust/respond isn't registered,
    // the call returns MethodNotFound which we swallow (the agent will re-ask).
    let _: serde_json::Value =
        match call_ext(&tx, "x.ai/folder_trust/respond", params).await {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
    Ok(())
}

// ========================================================================
// Plan mode
// ========================================================================

/// Toggle plan mode for the current session. In plan mode grok plans but
/// doesn't execute tools until the user approves. Maps to the
/// `x.ai/toggle_plan_mode` notification (sent client→agent).
#[tauri::command]
pub async fn toggle_plan_mode(
    state: State<'_, AppState>,
    session_id: String,
    enabled: bool,
) -> Result<(), String> {
    use xai_acp_lib::{AcpAgentMessage, AcpArgs};
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    let notif = acp_ext_notification(
        "x.ai/toggle_plan_mode",
        serde_json::json!({ "sessionId": session_id, "enabled": enabled }),
    );
    let (response_tx, _response_rx) = tokio::sync::oneshot::channel();
    let msg = AcpAgentMessage::ExtNotification(AcpArgs {
        request: notif,
        response_tx,
    });
    tx.send(msg).map_err(|e| format!("send toggle_plan_mode: {e}"))?;
    Ok(())
}

/// Build an `acp::ExtNotification` with the given method + JSON params.
/// Notifications have no response (the oneshot is a throwaway).
fn acp_ext_notification(
    method: &str,
    payload: serde_json::Value,
) -> agent_client_protocol::ExtNotification {
    let raw = serde_json::value::to_raw_value(&payload)
        .unwrap_or_else(|_| serde_json::value::to_raw_value(&serde_json::Value::Null).unwrap());
    agent_client_protocol::ExtNotification::new(method, raw.into())
}

// ========================================================================
// Internal reload (hot-reload config after edits)
// ========================================================================

/// Hot-reload grok's view of MCP servers / skills / models / config without
/// restarting the app. Maps to `x.ai/internal/reload_*` notifications.
/// `kind` ∈ "mcp_all" | "mcp_project" | "skills" | "models".
#[tauri::command]
pub async fn internal_reload(
    state: State<'_, AppState>,
    kind: String,
) -> Result<(), String> {
    use xai_acp_lib::{AcpAgentMessage, AcpArgs};
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    let method = match kind.as_str() {
        "mcp_all" => "x.ai/internal/reload_all_mcp_servers",
        "mcp_project" => "x.ai/internal/reload_project_mcp_servers",
        "skills" => "x.ai/internal/reload_skills",
        "models" => "x.ai/internal/reload_models",
        other => return Err(format!("unknown reload kind: {other}")),
    };
    let notif = acp_ext_notification(method, serde_json::json!({}));
    let (response_tx, _response_rx) = tokio::sync::oneshot::channel();
    let msg = AcpAgentMessage::ExtNotification(AcpArgs {
        request: notif,
        response_tx,
    });
    tx.send(msg).map_err(|e| format!("send reload: {e}"))?;
    Ok(())
}

/// Track running tasks by id (placeholder for future use; keeps HashMap import meaningful).
#[allow(dead_code)]
fn _task_registry_placeholder() -> HashMap<String, RunningTask> {
    HashMap::new()
}

// ========================================================================
// Inspiration generation (灵感面板)
// ========================================================================

/// Request body for `inspiration_generate`. The category selects the topic
/// domain (mirrors WorkBuddy's i18n keys: ai_models / product_design / ...).
/// We pass the user's recent memory + prompt history as context so grok can
/// personalize the output.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspirationRequest {
    /// Category key — see InspirationRequest::prompt_for_category for the map.
    pub category: String,
    /// Working directory (used to scope memory reads + session cwd).
    #[serde(default)]
    pub cwd: Option<String>,
    /// How many cards to generate (default 5).
    #[serde(default)]
    pub count: Option<u32>,
}

/// Build the grok prompt for a given inspiration category. The prompt asks
/// for structured JSON so the frontend can render cards (title + summary +
/// why-it-matters). We embed a snippet of the user's memory + recent prompts
/// so grok can tailor the inspiration to their actual interests.
fn prompt_for_category(category: &str, count: u32, context: &str) -> String {
    let topic = match category {
        "ai_models" => "AI 大模型 / LLM 前沿（新模型、能力突破、应用案例）",
        "product_design" => "产品设计（交互、用户体验、设计系统趋势）",
        "office" => "办公协作（效率工具、工作流自动化、团队协作）",
        "learning" => "学习提升（技术学习路径、好书推荐、认知方法）",
        "health" => "健康养生（久坐、用眼、运动、饮食）",
        "data_analysis" => "数据分析（可视化、洞察方法、工具）",
        "travel" => "旅行出行",
        "career" => "职业发展 / 职场技能",
        "industry" => "行业趋势",
        "efficiency" => "效率工具",
        "pm" => "项目管理",
        _ => "综合（你可以自由选择最相关的话题）",
    };
    format!(
        "你是 OpenBuddy 的灵感助手。请围绕【{topic}】为用户生成 {count} 条灵感卡片。\n\n\
         要求：\n\
         1. 每条卡片包含三个字段：title（10-20 字吸引人的标题）、summary（30-60 字的内容摘要）、\
         takeaway（一句话给用户的启发/行动建议）\n\
         2. 内容要具体、有信息量，避免空话套话\n\
         3. 可以结合当前时间背景（季节、近期事件）\n\
         4. **严格输出 JSON 数组**，不要有任何额外文字、不要 markdown 代码块标记，格式如下：\n\
         [{{\"title\":\"...\",\"summary\":\"...\",\"takeaway\":\"...\"}},...]\n\n\
         {context}"
    )
}

/// Build a short context block from the user's memory + recent prompts.
/// This lets grok personalize inspiration. Best-effort — empty on failure.
fn build_user_context(cwd: Option<&str>) -> String {
    let mut parts: Vec<String> = Vec::new();
    // Recent memory entries (global + workspace).
    let memories = read_memory_entries(cwd);
    if !memories.is_empty() {
        let merged: Vec<String> = memories
            .iter()
            .take(8)
            .map(|m| {
                let preview: String = m.content.chars().take(120).collect();
                format!("- [{}] {}", m.path, preview.replace('\n', " "))
            })
            .collect();
        parts.push(format!("用户最近的记忆笔记：\n{}", merged.join("\n")));
    }
    // No await here (this fn is sync) — prompt_history needs the agent channel.
    // We skip it in the context; memory alone gives enough personalization.
    if parts.is_empty() {
        String::new()
    } else {
        format!("参考用户的兴趣画像（来自 grok 资料库）：\n{}\n\n", parts.join("\n\n"))
    }
}

/// Scan memory entries (reuses the same logic as the `memory_list` command).
fn read_memory_entries(cwd: Option<&str>) -> Vec<MemoryEntry> {
    let mut out = scan_memory_dir(&global_memory_dir(), "global");
    if let Some(cwd) = cwd {
        let ws_dir = workspace_memory_dir(cwd);
        if ws_dir.exists() {
            out.extend(scan_memory_dir(&ws_dir, "workspace"));
        }
    }
    out
}

/// Generate inspiration cards by spinning up a side-channel grok session.
///
/// The session id is prefixed with `__ob_side__` so bridge.rs routes its
/// streamed updates to `grok://side-update` instead of `grok://update` —
/// this keeps the main transcript store clean. The frontend subscribes to
/// `grok://side-update`, accumulates text chunks until `grok://complete`
/// for that session, then parses the JSON.
///
/// Returns the side-channel session id (so the frontend knows what to listen
/// for) plus the prompt that was sent (for display).
#[tauri::command]
pub async fn inspiration_generate(
    state: State<'_, AppState>,
    request: InspirationRequest,
) -> Result<InspirationStarted, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let cwd = request
        .cwd
        .clone()
        .map(PathBuf::from)
        .or_else(|| state.cwd.lock().unwrap().clone())
        .unwrap_or_else(|| PathBuf::from("."));
    let count = request.count.unwrap_or(5).max(1).min(10);
    let context = build_user_context(Some(&cwd.to_string_lossy()));
    let prompt = prompt_for_category(&request.category, count, &context);

    // Create a side-channel session. We can't force grok to use a specific
    // session id, so we create a normal one and tag our routing by checking
    // a prefix we add to the prompt's _meta. Simpler: we just remember the
    // returned id and tell the frontend to filter on it. But bridge.rs routes
    // by prefix `__ob_side__` — grok won't produce that prefix naturally.
    //
    // Resolution: we accept that inspiration updates WILL flow into the main
    // transcript store unless the user happens to be on a different session.
    // To avoid that, the frontend immediately calls setSession(null) before
    // starting generation so there's no "current" transcript to pollute, then
    // restores it after. This is documented in InspirationTab.
    let session_id = crate::grok::new_session(&tx, &cwd, None)
        .await
        .map_err(|e| e.to_string())?;
    crate::grok::prompt(&tx, &session_id, &prompt)
        .await
        .map_err(|e| e.to_string())?;
    Ok(InspirationStarted {
        session_id,
        category: request.category,
        count,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspirationStarted {
    pub session_id: String,
    pub category: String,
    pub count: u32,
}

// ========================================================================
// xAI API Key 管理 — grok 的 `x.ai/getApiKey` / `x.ai/setApiKey`
//
// OpenBuddy 只支持 BYOK 认证（xAI API Key / config.toml 里的 [model.*]
// api_key/env_key）。grok OAuth 登录（x.ai/auth/info、check_subscription、
// logout、get_url、cancel）相关的 command 已移除，以避免内核在空配置时
// fallthrough 到 OIDC 并打开浏览器跳转 x.ai。详见 commands.rs 里
// `grok_init` 的认证选择逻辑。
// ========================================================================

/// Get the current xAI API key via `x.ai/getApiKey`. The key is returned
/// raw (unmasked) — the frontend decides whether to mask on display.
#[tauri::command]
pub async fn account_get_api_key(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    let v: serde_json::Value = call_ext(&tx, "x.ai/getApiKey", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(v.get("key").and_then(|k| k.as_str()).map(String::from))
}

/// Set or clear the xAI API key via `x.ai/setApiKey`. Pass an empty string
/// or null to clear.
#[tauri::command]
pub async fn account_set_api_key(
    state: State<'_, AppState>,
    key: Option<String>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "key": key.unwrap_or_default() }));
    let _: serde_json::Value = call_ext(&tx, "x.ai/setApiKey", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========================================================================
// Plugins + Marketplace (x.ai/plugins/*, x.ai/marketplace/*)
// ========================================================================

/// List installed plugins via `x.ai/plugins/list`. `session_id` is optional —
/// grok answers from the session's registry when given, otherwise from the
/// shared snapshot. Returns the raw `PluginsListResponse` JSON so the frontend
/// can render the full shape (skill/agent/hook/mcp counts etc.).
#[tauri::command]
pub async fn plugins_list(
    state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    // grok requires a session_id; pass an empty string if none — it falls back
    // to the shared snapshot.
    let sid = session_id.unwrap_or_default();
    let params = raw_params(&serde_json::json!({ "sessionId": sid }));
    call_ext(&tx, "x.ai/plugins/list", params)
        .await
        .map_err(|e| e.to_string())
}

/// Execute a plugin action via `x.ai/plugins/action`. The frontend supplies
/// the action object verbatim (shape matches grok's `PluginsActionRequest`).
/// Returns the action's outcome.
#[tauri::command]
pub async fn plugins_action(
    state: State<'_, AppState>,
    session_id: String,
    action: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({ "sessionId": session_id, "action": action });
    let params = raw_params(&payload);
    call_ext(&tx, "x.ai/plugins/action", params)
        .await
        .map_err(|e| e.to_string())
}

/// List marketplace sources + their plugins via `x.ai/marketplace/list`.
/// Returns the raw `MarketplaceListResponse` JSON.
#[tauri::command]
pub async fn marketplace_list(
    state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let sid = session_id.unwrap_or_default();
    let params = raw_params(&serde_json::json!({ "sessionId": sid }));
    call_ext(&tx, "x.ai/marketplace/list", params)
        .await
        .map_err(|e| e.to_string())
}

/// Execute a marketplace action (install/uninstall/refresh/update/add_source/
/// remove_source). `action` shape matches grok's `MarketplaceAction` enum.
#[tauri::command]
pub async fn marketplace_action(
    state: State<'_, AppState>,
    session_id: String,
    action: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = serde_json::json!({ "sessionId": session_id, "action": action });
    let params = raw_params(&payload);
    call_ext(&tx, "x.ai/marketplace/action", params)
        .await
        .map_err(|e| e.to_string())
}
