//! ACP → Tauri bridge.
//!
//! A long-lived task drains `GrokHandle.rx` (the agent→client channel) and:
//!  - `SessionNotification` → serialize the SessionUpdate, emit `grok://update`,
//!    then ack the oneshot (agent future hangs otherwise);
//!  - `RequestPermission` → register a pending permission in `Permissions`,
//!    emit `grok://permission` (the frontend resolves via a command);
//!  - `ExtNotification("x.ai/session/prompt_complete")` → emit `grok://complete`;
//!  - fs/terminal requests → never arrive (we advertised no capability); if
//!    they do, we deny so the agent future still completes.

use std::collections::HashMap;
use std::sync::Arc;

use agent_client_protocol as acp;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, oneshot};
use uuid::Uuid;

use xai_acp_lib::AcpClientMessage;

/// Registry of permissions awaiting a user decision. The frontend calls the
/// `grok_resolve_permission` command, which looks up the entry by id and
/// fulfills the oneshot the agent is waiting on.
#[derive(Default, Clone)]
pub struct Permissions {
    inner: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionOutcome>>>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionFrontend {
    pub request_id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub tool_kind: String,
    pub title: String,
    pub raw_input: Option<Value>,
    pub options: Vec<PermissionOptionFrontend>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOptionFrontend {
    pub option_id: String,
    pub kind: String,
    pub title: String,
}

pub enum PermissionOutcome {
    Selected(String), // optionId
    Cancelled,
}

impl Permissions {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cheap clone (inner is `Arc<Mutex<..>>`). Used to hand the registry
    /// to the dispatcher from a `State<Permissions>` without moving it out.
    pub fn share(&self) -> Permissions {
        Permissions {
            inner: self.inner.clone(),
        }
    }

    /// Register a pending permission; returns the id and the receiver the
    /// dispatcher awaits (then forwards back to the agent).
    pub async fn register(&self, _session_id: &str) -> (String, oneshot::Receiver<PermissionOutcome>) {
        let id = Uuid::now_v7().to_string();
        let (tx, rx) = oneshot::channel();
        self.inner.lock().await.insert(id.clone(), tx);
        (id, rx)
    }

    /// Called by the `grok_resolve_permission` command.
    pub async fn resolve(&self, id: &str, outcome: PermissionOutcome) -> bool {
        let mut map = self.inner.lock().await;
        if let Some(tx) = map.remove(id) {
            let _ = tx.send(outcome);
            true
        } else {
            false
        }
    }
}

/// Payload emitted on the `grok://update` event — the raw SessionUpdate JSON,
/// plus the session id it belongs to (so the frontend can route updates for
/// side-channel sessions like inspiration generation away from the main
/// transcript store).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvent {
    /// Session id this update belongs to. `None` only if grok omitted it
    /// (shouldn't happen for SessionNotification). When present, the frontend
    /// checks it against the current session before applying.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(flatten)]
    pub update: Value,
}

/// Payload emitted on `grok://complete`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteEvent {
    pub session_id: String,
    pub stop_reason: String,
}

/// Payload emitted on `grok://summary` — a freshly generated (or manually
/// renamed) session title. The frontend updates the sidebar entry in place.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryEvent {
    pub session_id: String,
    pub title: String,
}

/// Spawn the dispatcher that forwards agent→client messages to the frontend.
pub fn spawn_dispatcher(
    app: AppHandle,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<AcpClientMessage>,
    permissions: Permissions,
) {
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            handle_client_message(&app, msg, &permissions).await;
        }
        tracing::info!("grok agent channel closed");
    });
}

async fn handle_client_message(app: &AppHandle, msg: AcpClientMessage, perms: &Permissions) {
    match msg {
        AcpClientMessage::SessionNotification(b) => {
            let update = serialize_session_update(&b.request.update);
            let sid = b.request.session_id.0.as_ref().to_string();
            let _ = app.emit(
                "grok://update",
                UpdateEvent {
                    session_id: Some(sid),
                    update,
                },
            );
            // ACK so the agent's notification future completes.
            let _ = b.response_tx.send(Ok(()));
        }
        AcpClientMessage::RequestPermission(b) => {
            let req = &b.request;
            let session_id_str = req.session_id.0.as_ref().to_string();
            let (id, rx) = perms.register(&session_id_str).await;

            // Build the frontend payload. RequestPermissionRequest has
            // `session_id` (SessionId) and `options` (Vec<PermissionOption>);
            // each option has `option_id` (PermissionOptionId), `name` (String),
            // `kind` (PermissionOptionKind). The toolCallId/title live inside
            // an optional `update` sub-object we don't model here.
            let options: Vec<PermissionOptionFrontend> = req
                .options
                .iter()
                .map(|o| PermissionOptionFrontend {
                    option_id: o.option_id.0.as_ref().to_string(),
                    kind: permission_kind_str(&o.kind).to_string(),
                    title: o.name.clone(),
                })
                .collect();
            let frontend = PermissionFrontend {
                request_id: id,
                session_id: session_id_str,
                tool_call_id: String::new(),
                tool_kind: String::new(),
                title: options
                    .first()
                    .map(|o| o.title.clone())
                    .unwrap_or_else(|| "permission".into()),
                raw_input: None,
                options,
            };
            let _ = app.emit("grok://permission", frontend);

            // Wait for the frontend's decision, then answer the agent.
            let outcome = rx.await.unwrap_or(PermissionOutcome::Cancelled);
            let response = match outcome {
                PermissionOutcome::Selected(option_id) => {
                    acp::RequestPermissionResponse::new(
                        acp::RequestPermissionOutcome::Selected(
                            acp::SelectedPermissionOutcome::new(acp::PermissionOptionId::new(
                                Arc::from(option_id.as_str()),
                            )),
                        ),
                    )
                }
                PermissionOutcome::Cancelled => acp::RequestPermissionResponse::new(
                    acp::RequestPermissionOutcome::Cancelled,
                ),
            };
            let _ = b.response_tx.send(Ok(response));
        }
        AcpClientMessage::ExtNotification(b) => {
            let method = b.request.method.as_ref().to_string();
            // params is a RawValue on the wire; deserialize to extract fields.
            let raw_str = b.request.params.get();
            let params: Value = serde_json::from_str(raw_str).unwrap_or(Value::Null);
            if method == "x.ai/session/prompt_complete" {
                // Prompt finished: surface sessionId / stopReason to the frontend.
                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let stop_reason = params
                    .get("stopReason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("end_turn")
                    .to_string();
                let _ = app.emit(
                    "grok://complete",
                    CompleteEvent {
                        session_id,
                        stop_reason,
                    },
                );
            } else if method == "x.ai/session_notification" {
                // Session-scoped notification: grok uses this to push
                // `SessionSummaryGenerated` after the first user prompt (the
                // LLM-generated title). The update is a tagged enum with the
                // wire field name `sessionUpdate` (see notification.rs:359).
                handle_session_notification(app, &params);
            } else if method == "x.ai/mcp/server_status" || method == "x.ai/mcp/init_progress" {
                // MCP connector status / startup progress — surface to the
                // connectors panel for live state updates.
                let _ = app.emit("grok://mcp-status", &params);
            } else if method == "x.ai/folder_trust/request" {
                // grok is asking us to trust a folder before running tools in
                // it. Surface to the frontend as a trust dialog.
                let _ = app.emit("grok://folder-trust", &params);
            } else if method == "x.ai/toggle_plan_mode" {
                // Plan mode toggled (either by us or by grok). Mirror to frontend.
                let _ = app.emit("grok://plan-mode", &params);
            } else if method == "x.ai/yolo_mode_changed" {
                // Permission mode (auto/yolo) changed.
                let _ = app.emit("grok://permission-mode", &params);
            } else if method == "x.ai/models/update" {
                // Model list updated (e.g. after config reload).
                let _ = app.emit("grok://models-update", &params);
            } else if method == "x.ai/task_backgrounded" || method == "x.ai/task_completed" {
                // Background task lifecycle — refresh the tasks panel.
                let _ = app.emit("grok://task-update", &params);
            } else if method == "x.ai/git_head_changed" || method == "x.ai/gitHeadChanged" {
                // git HEAD moved — useful for status bar / worktree UI.
                let _ = app.emit("grok://git-head", &params);
            }
            let _ = b.response_tx.send(Ok(()));
        }
        AcpClientMessage::ReadTextFile(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::WriteTextFile(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::CreateTerminal(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::TerminalOutput(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::ReleaseTerminal(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::WaitForTerminalExit(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::KillTerminalCommand(b) => deny_fs_terminal(b.response_tx),
        AcpClientMessage::ExtMethod(b) => {
            let err = acp::Error::new(
                acp::ErrorCode::MethodNotFound.into(),
                "ext method unsupported".to_string(),
            );
            let _ = b.response_tx.send(Err(err));
        }
    }
}

/// Parse an `x.ai/session_notification` payload and, if it carries a freshly
/// generated session title (`SessionSummaryGenerated`), emit `grok://summary`
/// so the frontend can update the sidebar entry. Unknown update variants are
/// ignored (we ACK regardless, in `handle_client_message`).
///
/// The wire shape (snake_case tag AND fields — grok's `SessionUpdate` uses
/// `rename_all = "snake_case"` on the enum, which renames only the tag; the
/// struct-variant fields keep their Rust snake_case names):
/// ```json
/// { "sessionId": "...", "update": { "sessionUpdate": "session_summary_generated",
///                                   "session_summary": "..." }, "meta": {...} }
/// ```
fn handle_session_notification(app: &AppHandle, params: &Value) {
    let Some(session_id) = params.get("sessionId").and_then(|v| v.as_str()) else {
        return;
    };
    let Some(update) = params.get("update") else {
        return;
    };
    let kind = update
        .get("sessionUpdate")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if kind == "session_summary_generated" {
        // Accept the camelCase variant too, defensively — reading only
        // `sessionSummary` silently drops every generated title (the event
        // never fires and the sidebar/topbar keeps the placeholder).
        let title = update
            .get("session_summary")
            .or_else(|| update.get("sessionSummary"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !title.is_empty() {
            let _ = app.emit(
                "grok://summary",
                SummaryEvent {
                    session_id: session_id.to_string(),
                    title: title.to_string(),
                },
            );
        }
    }
}

/// Send a MethodNotFound error on a fs/terminal response channel. We advertised
/// no fs/terminal capability so these shouldn't arrive — deny to keep the
/// agent's future from hanging.
fn deny_fs_terminal<T>(response_tx: tokio::sync::oneshot::Sender<acp::Result<T>>) {
    let err = acp::Error::new(
        acp::ErrorCode::MethodNotFound.into(),
        "OpenBuddy does not handle fs/terminal requests".to_string(),
    );
    let _ = response_tx.send(Err(err));
}

/// `acp::SessionUpdate` isn't `Serialize` in a form we can emit directly, so
/// round-trip through JSON: the ACP crate does serialize for the wire format.
fn serialize_session_update(update: &acp::SessionUpdate) -> Value {
    serde_json::to_value(update).unwrap_or_else(|_| {
        serde_json::json!({ "type": "unknown", "error": "failed to serialize session update" })
    })
}

fn permission_kind_str(k: &acp::PermissionOptionKind) -> &'static str {
    match k {
        acp::PermissionOptionKind::AllowOnce => "allow",
        acp::PermissionOptionKind::AllowAlways => "allow_always",
        acp::PermissionOptionKind::RejectOnce => "deny",
        acp::PermissionOptionKind::RejectAlways => "deny_always",
        _ => "other",
    }
}
