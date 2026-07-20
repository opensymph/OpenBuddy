//! In-process grok agent bridge.
//!
//! The agent (`MvpAgent` from `xai-grok-shell`) is `!Send` (all fields are
//! `Rc`/`RefCell`), so it must live on one OS thread driven by a
//! current-thread tokio runtime + `LocalSet`. We spawn that thread once at
//! app startup and communicate with the agent purely through the typed ACP
//! mpsc channels from `xai-acp-lib::acp_channels()`.
//!
//! Pattern A (direct dispatch) from `xai-grok-pager/src/acp/spawn.rs`: the
//! gateway receiver calls `MvpAgent`'s `acp::Agent` methods directly over
//! `Rc<MvpAgent>` — no byte streams, no line framing, no WebSocket.
//!
//! `ClientCapabilities` advertise NO fs/terminal support, so the agent uses
//! its own built-in tool implementations (read_file, run_terminal_command,
//! etc.) rather than round-tripping them back to us. We only need to handle
//! `session/update` (streaming + tool calls) and `session/request_permission`.

use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::Arc;

use agent_client_protocol as acp;
use anyhow::{Result, anyhow};
use serde::Serialize;
use tokio_util::sync::CancellationToken;

use xai_acp_lib::{
    AcpAgentGatewaySender, AcpAgentTx, AcpClientRx, AcpGatewayReceiver, acp_channels, acp_send,
};
use xai_grok_shell::agent::init::bootstrap;
use xai_grok_shell::agent::mvp_agent::MvpAgent;
use xai_grok_shell::auth::AuthManager;
use xai_grok_shell::util::config::load_effective_config;

// Re-aliased to mirror grok's own internal import style.
use xai_grok_shell::agent::config::{Config as AgentConfig, RuntimeResolutionContext};

/// One end of the ACP channel pair that lives on the Tauri (multi-thread) side.
/// The client sends requests to the agent via `tx` (`AcpAgentTx`) and receives
/// responses/notifications from the agent via `rx` (`AcpClientRx`). The agent
/// thread holds the other end.
pub struct GrokHandle {
    pub tx: AcpAgentTx,
    pub rx: AcpClientRx,
    pub cancel: CancellationToken,
}

/// Spawn the grok agent in-process on a dedicated thread.
///
/// `cwd` is the working directory the agent binds sessions to (typically the
/// user's home or a chosen project). Auth is read from `~/.grok/auth.json`
/// — no re-login if it already exists.
pub fn spawn_grok(_cwd: PathBuf) -> Result<GrokHandle> {
    // 1. Load + resolve config (~/.grok/config.toml; defaults if absent).
    let raw = load_effective_config().map_err(|e| anyhow!("load config: {e}"))?;
    let mut cfg = AgentConfig::new_from_toml_cfg(&raw).map_err(|e| anyhow!("parse config: {e}"))?;
    cfg.resolve_runtime_fields(&RuntimeResolutionContext {
        raw_config: &raw,
        remote_settings: None,
        is_headless: true,
        cli_subagents: Some(false),
        cli_web_search_model: None,
        cli_session_summary_model: None,
        cli_experimental_memory: false,
        cli_no_memory: false,
        disable_web_search: false,
        todo_gate: false,
        laziness_debug_log: None,
        storage_mode: None,
    });

    // 2. Auth: reuse ~/.grok/auth.json.
    let grok_home = grok_home_dir();
    let auth_manager = Arc::new(AuthManager::new(&grok_home, cfg.grok_com_config.clone()));
    auth_manager.configure_refresher(cfg.grok_com_config.auth_provider_command.clone(), None);

    // 3. Bootstrap: telemetry, bundled files, ModelsManager.
    let (cfg, models_manager) =
        bootstrap(&cfg, &auth_manager, None).map_err(|e| anyhow!("bootstrap: {e}"))?;

    // 4. Typed ACP channel pair.
    let (acp_client, acp_agent) = acp_channels();
    let cancel = CancellationToken::new();

    // 5. Agent thread (!Send → own OS thread + current_thread runtime + LocalSet).
    let cancel_for_thread = cancel.clone();
    std::thread::Builder::new()
        .name("grok-agent".into())
        .spawn(move || -> Result<()> {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, async move {
                let client_tx = acp_agent.tx.clone();
                // The gateway sender implements `acp::Client` and forwards the
                // agent's reverse-direction calls onto our mpsc channel.
                // `AcpAgentGatewaySender` = `AcpGatewaySender<acp::AgentSide>`,
                // whose OutMessage is `AcpClientMessage` — matching what
                // `acp_agent.tx` (Sender<AcpClientMessage>) accepts.
                let gateway = AcpAgentGatewaySender::new(client_tx);
                let agent = MvpAgent::with_models(gateway, &cfg, auth_manager, models_manager);
                let agent_rc = Rc::new(agent);

                // Direct dispatch: the receiver calls MvpAgent's `acp::Agent`
                // methods directly (Pattern A from spawn_grok_shell). Use the
                // generic AcpGatewayReceiver (not the AcpAgentGatewayReceiver
                // alias, which fixes C = AgentSideConnection).
                let gw_rx = AcpGatewayReceiver::new(acp_agent.rx, agent_rc).with_tracing(true);
                tokio::task::spawn_local(gw_rx.run());
                tokio::task::yield_now().await;

                cancel_for_thread.cancelled().await;
                Ok(())
            })
        })?;

    Ok(GrokHandle {
        tx: acp_client.tx,
        rx: acp_client.rx,
        cancel,
    })
}

/// Resolve `~/.grok` in a way that avoids the `\\?\` verbatim prefix on
/// Windows (which breaks downstream git/tools). Delegates to grok's own
/// helper when available; falls back to `dirs` otherwise.
fn grok_home_dir() -> PathBuf {
    // grok's grok_home() is in xai-grok-config (not a direct dep here). Use
    // the same logic: $GROK_HOME or ~/.grok, canonicalized via dunce.
    if let Ok(custom) = std::env::var("GROK_HOME") {
        let p = PathBuf::from(custom);
        let _ = std::fs::create_dir_all(&p);
        return p;
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let p = home.join(".grok");
    let _ = std::fs::create_dir_all(&p);
    p
}

// ---------- ACP lifecycle helpers ----------

/// Outcome of `initialize`. We only need the auth methods + model id.
#[derive(Debug, Serialize, Clone)]
pub struct InitOutcome {
    pub ok: bool,
    pub auth_methods: Vec<String>,
    pub default_model_id: Option<String>,
    pub agent_version: Option<String>,
}

/// Run `initialize` against the agent. Advertises NO fs/terminal capability
/// so the agent runs its own tools.
pub async fn initialize(tx: &AcpAgentTx) -> Result<InitOutcome> {
    let meta = serde_json::json!({
        "clientType": "openbuddy",
        "clientVersion": env!("CARGO_PKG_VERSION"),
    });
    let req = acp::InitializeRequest::new(acp::ProtocolVersion::V1)
        .client_capabilities(
            // Advertise NO fs and NO terminal capability → the agent uses its
            // own built-in file/shell tools and never round-trips those
            // requests back to us. (ClientCapabilities::new() defaults to
            // both disabled; we only spell out terminal(false) for clarity.)
            acp::ClientCapabilities::new().terminal(false),
        )
        .meta(meta.as_object().cloned());
    let resp: acp::InitializeResponse = acp_send(req, tx)
        .await
        .map_err(|e| anyhow!("initialize: {e:?}"))?;

    let auth_methods = resp
        .auth_methods
        .iter()
        .map(|m| m.id().0.as_ref().to_string())
        .collect();
    Ok(InitOutcome {
        ok: true,
        auth_methods,
        // grok's modelState uses `currentModelId` (not `defaultModelId`) for
        // the active model. Try both keys defensively in case of version skew.
        default_model_id: resp
            .meta
            .as_ref()
            .and_then(|m| m.get("modelState"))
            .and_then(|v| {
                v.get("currentModelId")
                    .or_else(|| v.get("defaultModelId"))
            })
            .and_then(|v| v.as_str())
            .map(String::from),
        agent_version: resp
            .meta
            .as_ref()
            .and_then(|m| m.get("agentVersion"))
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

/// Authenticate using the agent's first advertised method. With
/// `~/.grok/auth.json` present and valid this succeeds without interaction.
pub async fn authenticate(tx: &AcpAgentTx, method_id: &str) -> Result<()> {
    let req = acp::AuthenticateRequest::new(acp::AuthMethodId::new(method_id.to_string()));
    let _: acp::AuthenticateResponse = acp_send(req, tx)
        .await
        .map_err(|e| anyhow!("authenticate: {e:?}"))?;
    Ok(())
}

/// Create a new session bound to `cwd`. Returns the new session id.
///
/// If `model_id` is supplied, it is passed as `_meta.modelId` so grok binds
/// the session to that model from the very start. This avoids the
/// new_session → set_session_model two-step, which could leave the session's
/// sampling config pinned to grok's default model (`grok-build`, which has
/// no key in a BYOK-only setup) before the switch lands.
pub async fn new_session(tx: &AcpAgentTx, cwd: &Path, model_id: Option<&str>) -> Result<String> {
    tracing::info!(cwd = %cwd.display(), model_id, "openbuddy: new_session send");
    let mut req = acp::NewSessionRequest::new(cwd.to_path_buf()).mcp_servers(vec![]);
    if let Some(mid) = model_id.filter(|s| !s.is_empty()) {
        let meta = serde_json::json!({ "modelId": mid });
        req = req.meta(meta.as_object().cloned());
    }
    let resp: acp::NewSessionResponse = acp_send(req, tx)
        .await
        .map_err(|e| {
            tracing::error!(error = ?e, "openbuddy: new_session FAILED");
            anyhow!("new_session: {e:?}")
        })?;
    tracing::info!(session_id = %resp.session_id.0, "openbuddy: new_session OK");
    Ok(resp.session_id.0.to_string())
}

/// Resume an existing session by replaying its persisted history.
pub async fn load_session(tx: &AcpAgentTx, session_id: &str, cwd: &Path) -> Result<()> {
    let req = acp::LoadSessionRequest::new(
        acp::SessionId::new(session_id.to_string()),
        cwd.to_path_buf(),
    );
    let _: acp::LoadSessionResponse = acp_send(req, tx)
        .await
        .map_err(|e| anyhow!("load_session: {e:?}"))?;
    Ok(())
}

/// Send a user prompt. Returns once the agent accepts it; streamed updates
/// arrive on the client rx channel (drained by the dispatcher in bridge.rs).
pub async fn prompt(tx: &AcpAgentTx, session_id: &str, text: &str) -> Result<()> {
    tracing::info!(session_id, text_len = text.len(), "openbuddy: prompt send");
    let req = acp::PromptRequest::new(
        session_id.to_string(),
        vec![acp::ContentBlock::from(text)],
    );
    let resp: acp::PromptResponse = acp_send(req, tx)
        .await
        .map_err(|e| {
            tracing::error!(error = ?e, "openbuddy: prompt acp_send FAILED");
            anyhow!("prompt: {e:?}")
        })?;
    tracing::info!(session_id, "openbuddy: prompt accepted (wait for streamed updates)");
    let _ = resp; // PromptResponse only carries an optional messageId; stop_reason comes via events.
    Ok(())
}

/// Switch the model used by an existing session. Maps to grok's
/// `session/set_model` ACP method (`SetSessionModelRequest`). grok will
/// re-derive sampling config, sync the API key, and broadcast a
/// `ModelChanged` notification.
///
/// Caveat: if the session has existing turns and the new model requires a
/// different agent harness, grok rejects this with
/// `MODEL_SWITCH_INCOMPATIBLE_AGENT` — surface that error to the caller so
/// the UI can prompt for a new session.
pub async fn set_session_model(tx: &AcpAgentTx, session_id: &str, model_id: &str) -> Result<()> {
    tracing::info!(session_id, model_id, "openbuddy: set_session_model send");
    let req = acp::SetSessionModelRequest::new(
        acp::SessionId::new(session_id.to_string()),
        acp::ModelId::new(std::sync::Arc::from(model_id)),
    );
    let _: acp::SetSessionModelResponse = acp_send(req, tx)
        .await
        .map_err(|e| {
            tracing::error!(session_id, model_id, error = ?e, "openbuddy: set_session_model FAILED");
            anyhow!("set_session_model: {e:?}")
        })?;
    tracing::info!(session_id, model_id, "openbuddy: set_session_model OK");
    Ok(())
}

/// Cancel the in-flight prompt for a session.
///
/// Cancel is a *notification* (no response). We build the `AcpAgentMessage::Cancel`
/// variant directly and send it on the channel — the agent's gateway receiver
/// dispatches it to `MvpAgent::cancel`. A throwaway oneshot satisfies the
/// `AcpArgs.response_tx` shape; the agent may or may not send on it.
pub async fn cancel(tx: &AcpAgentTx, session_id: &str) -> Result<()> {
    use xai_acp_lib::{AcpAgentMessage, AcpArgs};
    let notif = acp::CancelNotification::new(acp::SessionId::new(session_id.to_string()));
    let (response_tx, _response_rx) =
        tokio::sync::oneshot::channel();
    let msg = AcpAgentMessage::Cancel(AcpArgs {
        request: notif,
        response_tx,
    });
    tx.send(msg).map_err(|e| anyhow!("cancel send: {e}"))?;
    Ok(())
}

/// Rename a session by calling grok's `x.ai/session/rename` extension method.
///
/// This is the canonical path (see `xai-grok-shell/src/extensions/session_admin.rs:60`):
/// it writes `summary.json`'s `generated_title` with `title_is_manual=true`,
/// refreshes the FTS search index, and broadcasts `SessionSummaryGenerated`.
/// **Do not** edit `summary.json` directly — the agent holds the Summary in
/// memory and flushes periodically, so a direct write would be clobbered.
///
/// `cwd` is optional but recommended: grok uses it to narrow the summary scan
/// when locating the session on disk.
pub async fn rename_session(
    tx: &AcpAgentTx,
    session_id: &str,
    title: &str,
    cwd: Option<&str>,
) -> Result<()> {
    let params = crate::ext::raw_params(&serde_json::json!({
        "sessionId": session_id,
        "title": title,
        // `cwd` null is fine — grok treats it as "search all sessions".
        "cwd": cwd,
    }));
    let _: acp::ExtResponse = crate::ext::call_ext_value(tx, "x.ai/session/rename", params).await?;
    Ok(())
}

/// Delete a session's persisted history by calling grok's
/// `x.ai/session/delete` extension method (session_admin.rs:230).
///
/// Removes the on-disk session directory, drops it from the FTS index, and
/// if the session is live in memory, requests a graceful shutdown. The
/// sidebar's local entry is removed by the frontend on success.
pub async fn delete_session(
    tx: &AcpAgentTx,
    session_id: &str,
    cwd: Option<&str>,
) -> Result<()> {
    let params = crate::ext::raw_params(&serde_json::json!({
        "sessionId": session_id,
        "cwd": cwd,
    }));
    let _: acp::ExtResponse = crate::ext::call_ext_value(tx, "x.ai/session/delete", params).await?;
    Ok(())
}
