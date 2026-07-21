//! Tauri command table — the frontend↔Rust contract.
//!
//! Commands are declared with `#[tauri::command]` and registered in lib.rs.
//! They drive the in-process grok agent (see grok.rs) and bridge streamed
//! events back via Tauri events (see bridge.rs).

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::bridge::{PermissionOutcome, Permissions, QuestionOutcome, Questions};
use crate::grok::{self, GrokHandle, InitOutcome};
use crate::sessions::{self, SessionSummary, WorkspaceInfo};

/// State held across commands. The agent channel endpoints live here once
/// `grok_init` has spawned the agent.
#[derive(Default)]
pub struct AppState {
    pub handle: Mutex<Option<GrokHandle>>,
    /// Once the dispatcher owns the rx half, only the tx is reachable. We
    /// stash a clone of the tx sender here for commands to use.
    pub tx: Mutex<Option<xai_acp_lib::AcpAgentTx>>,
    pub cwd: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub ready: bool,
    pub has_auth_file: bool,
    pub reason: Option<String>,
    /// Model ids configured in `~/.grok/config.toml` (BYOK providers). When
    /// non-empty the app is usable without grok OAuth — grok routes prompts
    /// to the matching `[model.*]` backend.
    pub providers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitResult {
    pub ok: bool,
    pub auth: AuthStatus,
    pub cwd: String,
    pub agent_version: Option<String>,
    pub default_model_id: Option<String>,
}

fn default_cwd() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn has_auth_file() -> bool {
    let home = if let Ok(custom) = std::env::var("GROK_HOME") {
        PathBuf::from(custom)
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".grok")
    };
    home.join("auth.json").exists()
}

/// Initialize the in-process grok agent. Spawns the agent thread, runs
/// `initialize` + `authenticate`, and starts the dispatcher.
#[tauri::command]
pub async fn grok_init(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    permissions: State<'_, Permissions>,
    questions: State<'_, Questions>,
    cwd: Option<String>,
) -> Result<InitResult, String> {
    let cwd = cwd.map(PathBuf::from).unwrap_or_else(default_cwd);
    *state.cwd.lock().unwrap() = Some(cwd.clone());

    let auth_ok = has_auth_file();

    // Spawn the agent off the async runtime. `spawn_grok` does blocking I/O
    // (config load, first-run bundled extract under ~/.grok). Running it
    // inline would stall Tauri's tokio workers and freeze the UI.
    let spawn_cwd = cwd.clone();
    let grok::GrokHandle { tx, rx, cancel } = tokio::task::spawn_blocking(move || {
        grok::spawn_grok(spawn_cwd)
    })
    .await
    .map_err(|e| format!("spawn grok task: {e}"))?
    .map_err(|e| format!("spawn grok: {e}"))?;

    // Stash tx for later commands; move rx into the dispatcher.
    *state.tx.lock().unwrap() = Some(tx.clone());

    // Start the dispatcher that forwards agent→client messages to events.
    // `rx` is moved in; the dispatcher owns it for the app lifetime.
    crate::bridge::spawn_dispatcher(app, rx, permissions.share(), questions.share());

    // Keep the cancel token so the agent thread can be stopped at shutdown.
    // (The rx half is now owned by the dispatcher; we hold only tx + cancel.)
    let (_placeholder_tx, placeholder_rx) =
        tokio::sync::mpsc::unbounded_channel::<xai_acp_lib::AcpClientMessage>();
    *state.handle.lock().unwrap() = Some(GrokHandle {
        tx,
        // Unused placeholder rx — the real rx lives in the dispatcher.
        rx: placeholder_rx,
        cancel,
    });

    // Run the ACP lifecycle: initialize + authenticate.
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent channel not ready")?;

    let init_outcome: InitOutcome = grok::initialize(&tx)
        .await
        .map_err(|e| format!("initialize: {e}"))?;

    // Authenticate with the first advertised method (cached_token / xai.api_key).
    if let Some(method) = init_outcome.auth_methods.first() {
        let _ = grok::authenticate(&tx, method).await;
    }

    let providers = crate::providers::providers_list();
    let provider_ids: Vec<String> = providers.iter().map(|p| p.model_id.clone()).collect();
    // Usable if EITHER grok OAuth is set up OR at least one BYOK provider
    // is configured. The OAuth-only path requires `auth.json`; the BYOK path
    // only needs `[model.*]` entries in config.toml.
    let ready = auth_ok || !provider_ids.is_empty();

    // Start the automations scheduler now that the agent channel is up.
    // Idempotent — safe if grok_init is somehow called twice.
    if let (Some(tx), Some(cwd)) = (state.tx.lock().unwrap().clone(), state.cwd.lock().unwrap().clone()) {
        crate::automations::start_scheduler(tx, cwd);
    }

    Ok(InitResult {
        ok: true,
        auth: AuthStatus {
            ready,
            has_auth_file: auth_ok,
            providers: provider_ids,
            reason: if ready {
                None
            } else {
                Some("No provider configured. Add an API key in Settings.".into())
            },
        },
        cwd: cwd.to_string_lossy().into_owned(),
        agent_version: init_outcome.agent_version,
        default_model_id: init_outcome.default_model_id,
    })
}

#[tauri::command]
pub fn grok_auth_status(_state: State<'_, AppState>) -> AuthStatus {
    let has = has_auth_file();
    let providers = crate::providers::providers_list();
    let provider_ids: Vec<String> = providers.iter().map(|p| p.model_id.clone()).collect();
    let ready = has || !provider_ids.is_empty();
    AuthStatus {
        ready,
        has_auth_file: has,
        providers: provider_ids,
        reason: if ready {
            None
        } else {
            Some("No provider configured.".into())
        },
    }
}

#[tauri::command]
pub async fn grok_new_session(
    state: State<'_, AppState>,
    cwd: String,
    model_id: Option<String>,
) -> Result<String, String> {
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    grok::new_session(&tx, &PathBuf::from(cwd), model_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn grok_load_session(
    state: State<'_, AppState>,
    session_id: String,
    cwd: String,
) -> Result<(), String> {
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    grok::load_session(&tx, &session_id, &PathBuf::from(cwd))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn grok_list_sessions(cwd: String) -> Vec<SessionSummary> {
    sessions::list_sessions(&cwd)
}

#[tauri::command]
pub async fn grok_send(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
) -> Result<(), String> {
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    grok::prompt(&tx, &session_id, &text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn grok_cancel(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    grok::cancel(&tx, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Resolve a pending permission request from the frontend.
#[tauri::command]
pub async fn grok_resolve_permission(
    permissions: State<'_, Permissions>,
    request_id: String,
    option_id: Option<String>,
    cancelled: Option<bool>,
) -> Result<bool, String> {
    let outcome = match (cancelled.unwrap_or(false), option_id) {
        (true, _) => PermissionOutcome::Cancelled,
        (false, Some(id)) => PermissionOutcome::Selected(id),
        (false, None) => PermissionOutcome::Cancelled,
    };
    Ok(permissions.resolve(&request_id, outcome).await)
}

/// Resolve a pending question request from the frontend.
///
/// Wire contract for grok's `AskUserQuestionExtResponse`:
/// - `cancelled: true` → `{ "outcome": "cancelled" }`
/// - otherwise → `{ "outcome": "accepted", "answers": {...}, "annotations"?: {...} }`
///
/// `answers` must be keyed by **question text** (not synthetic id). Values may
/// be a string or a list of strings (multi-select). Freeform answers use
/// label `"Other"` with the typed text in `annotations[question].notes`.
#[tauri::command]
pub async fn grok_resolve_question(
    questions: State<'_, Questions>,
    request_id: String,
    answers: Option<std::collections::HashMap<String, serde_json::Value>>,
    annotations: Option<std::collections::HashMap<String, QuestionAnnotationDto>>,
    cancelled: Option<bool>,
) -> Result<bool, String> {
    let outcome = if cancelled.unwrap_or(false) {
        QuestionOutcome::Cancelled
    } else if let Some(raw_answers) = answers {
        let mut normalized = std::collections::HashMap::new();
        for (k, v) in raw_answers {
            let labels = match v {
                serde_json::Value::String(s) => {
                    if s.is_empty() {
                        continue;
                    }
                    vec![s]
                }
                serde_json::Value::Array(arr) => arr
                    .into_iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .filter(|s| !s.is_empty())
                    .collect(),
                _ => continue,
            };
            if !labels.is_empty() {
                normalized.insert(k, labels);
            }
        }
        let anns = annotations.map(|m| {
            m.into_iter()
                .map(|(k, v)| {
                    (
                        k,
                        crate::bridge::QuestionAnnotation {
                            preview: v.preview,
                            notes: v.notes,
                        },
                    )
                })
                .collect()
        });
        QuestionOutcome::Accepted {
            answers: normalized,
            annotations: anns,
        }
    } else {
        QuestionOutcome::Cancelled
    };
    Ok(questions.resolve(&request_id, outcome).await)
}

/// DTO for per-question annotations from the frontend.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAnnotationDto {
    pub preview: Option<String>,
    pub notes: Option<String>,
}

/// Switch the model used by an existing session. Maps to grok's
/// `session/set_model`. May reject with `MODEL_SWITCH_INCOMPATIBLE_AGENT`
/// if the session has turns and the new model needs a different harness —
/// the error string is forwarded verbatim so the UI can prompt accordingly.
#[tauri::command]
pub async fn grok_set_model(
    state: State<'_, AppState>,
    session_id: String,
    model_id: String,
) -> Result<(), String> {
    let tx = state.tx.lock().unwrap().clone().ok_or("agent not initialized")?;
    grok::set_session_model(&tx, &session_id, &model_id)
        .await
        .map_err(|e| e.to_string())
}

/// List every working directory grok has seen (deduplicated), with a session
/// count per cwd. Used to populate the Composer's workspace picker.
#[tauri::command]
pub fn grok_list_workspaces() -> Vec<WorkspaceInfo> {
    sessions::list_workspaces()
}

/// Rename a session via grok's `x.ai/session/rename` extension method. On
/// success grok also broadcasts `SessionSummaryGenerated`, which our bridge
/// forwards as the `grok://summary` event — so the frontend will receive the
/// new title twice (once from this return, once from the event). That's fine:
/// both arrive at the same store `upsert` and are idempotent.
#[tauri::command]
pub async fn grok_rename_session(
    state: State<'_, AppState>,
    session_id: String,
    title: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    grok::rename_session(&tx, &session_id, &title, cwd.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Delete a session's persisted history via grok's `x.ai/session/delete`.
/// Removes the on-disk session directory; the frontend drops its sidebar
/// entry on success.
#[tauri::command]
pub async fn grok_delete_session(
    state: State<'_, AppState>,
    session_id: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    grok::delete_session(&tx, &session_id, cwd.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Pin or unpin a session. grok's `Summary` has no `pinned` field, so this is
/// OpenBuddy-only state stored in `~/.grok/openbuddy-state.json`. Returns the
/// new pinned value so the frontend can update without a re-fetch.
#[tauri::command]
pub fn grok_set_session_pinned(session_id: String, pinned: bool) -> Result<bool, String> {
    crate::meta::set_pinned(&session_id, pinned)
}

/// Archive or unarchive a session. grok's `Summary` has no `archived` field,
/// so this is OpenBuddy-only state stored in `~/.grok/openbuddy-state.json`.
/// Archived sessions are filtered out of `list_sessions`. Returns the new
/// archived value so the frontend can update without a re-fetch.
#[tauri::command]
pub fn grok_set_session_archived(session_id: String, archived: bool) -> Result<bool, String> {
    crate::meta::set_archived(&session_id, archived)
}
