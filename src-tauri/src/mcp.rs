//! Connectors panel — drives grok's `x.ai/mcp/*` extension methods.
//!
//! MCP server configs live in `~/.grok/config.toml` as `[mcp_servers.<name>]`
//! tables (see `xai-grok-config-types/src/mcp.rs` for the full schema). grok
//! owns the canonical state and exposes full CRUD over ACP, so we go through
//! `x.ai/mcp/list|upsert|delete|toggle` rather than editing the TOML directly
//! — grok will validate, start/stop the server, and broadcast status updates
//! via `x.ai/mcp/server_status` (which bridge.rs forwards as `grok://mcp-status`).

use std::collections::HashMap;

use agent_client_protocol as acp;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;
use crate::ext::{call_ext, call_ext_value, raw_params};

/// One MCP server entry surfaced to the UI. Mirrors the fields of grok's
/// `McpServerEntry` (`xai-grok-shell/src/inspect/mod.rs:227`) plus the live
/// status that arrives via `x.ai/mcp/server_status` notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEntry {
    pub name: String,
    /// Transport kind: "stdio" | "streamable_http" (grok also has "sse" as a
    /// sub-variant of streamable_http; we normalize to the transport name).
    #[serde(default)]
    pub transport: Option<String>,
    /// For stdio: the command. For http: the URL.
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    /// Where the config came from: "user" | "project" | "bundled" | ...
    #[serde(default)]
    pub source: Option<String>,
    /// Reason the server is disabled (if any) — surfaced by grok inspect.
    #[serde(default)]
    pub disabled_reason: Option<String>,
    /// Vendor/plugin that contributed this server, if any.
    #[serde(default)]
    pub vendor: Option<String>,
}

/// The list endpoint returns either a bare array or `{ servers: [...] }`,
/// depending on the grok build. Accept both.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum McpListResponse {
    Array(Vec<McpServerEntry>),
    Wrapped {
        #[serde(default)]
        servers: Vec<McpServerEntry>,
    },
}

impl McpListResponse {
    fn into_servers(self) -> Vec<McpServerEntry> {
        match self {
            McpListResponse::Array(v) => v,
            McpListResponse::Wrapped { servers } => servers,
        }
    }
}

/// Frontend payload for creating/updating an MCP server. We keep this loose
/// (transport-discriminated) so the UI can support both stdio and HTTP without
/// a round of protocol churn.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpUpsertRequest {
    pub name: String,
    /// "stdio" or "http". http covers both streamable_http and SSE.
    pub transport: String,
    /// stdio: the executable command. http: the URL.
    pub target: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// List configured MCP servers.
#[tauri::command]
pub async fn mcp_list(state: State<'_, AppState>) -> Result<Vec<McpServerEntry>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({}));
    let v: McpListResponse = call_ext(&tx, "x.ai/mcp/list", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(v.into_servers())
}

/// Add or update an MCP server. Translates the frontend payload into the
/// `[mcp_servers.<name>]` shape grok expects (see McpServerTransportConfig).
#[tauri::command]
pub async fn mcp_upsert(
    state: State<'_, AppState>,
    server: McpUpsertRequest,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let payload = build_upsert_payload(&server)?;
    let params = raw_params(&payload);
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/mcp/upsert", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete an MCP server by name.
#[tauri::command]
pub async fn mcp_delete(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "name": name }));
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/mcp/delete", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Enable or disable an MCP server at runtime (no restart needed).
#[tauri::command]
pub async fn mcp_toggle(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "name": name, "enabled": enabled }));
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/mcp/toggle", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Translate the frontend payload to the JSON grok's `x.ai/mcp/upsert` expects.
///
/// grok's `McpServerTransportConfig` is a flattened enum; the wire shape is:
/// ```toml
/// [mcp_servers.filesystem]            # stdio
/// command = "npx"
/// args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
///
/// [mcp_servers.linear]                # streamable_http
/// url = "https://mcp.linear.app/mcp"
/// ```
/// We build a `{ name, config: <McpServerConfig> }` object where `config` is
/// the transport table with `enabled` set.
fn build_upsert_payload(server: &McpUpsertRequest) -> Result<serde_json::Value, String> {
    let mut config = serde_json::Map::new();
    match server.transport.as_str() {
        "stdio" => {
            config.insert("command".into(), server.target.clone().into());
            if !server.args.is_empty() {
                config.insert(
                    "args".into(),
                    server.args.iter().cloned().map(serde_json::Value::from).collect::<Vec<_>>().into(),
                );
            }
            if !server.env.is_empty() {
                config.insert("env".into(), serde_json::to_value(&server.env).unwrap());
            }
        }
        "http" | "streamable_http" | "sse" => {
            config.insert("url".into(), server.target.clone().into());
            if !server.headers.is_empty() {
                config.insert("headers".into(), serde_json::to_value(&server.headers).unwrap());
            }
        }
        other => {
            return Err(format!(
                "unknown transport '{other}': expected 'stdio' or 'http'"
            ));
        }
    }
    if let Some(enabled) = server.enabled {
        config.insert("enabled".into(), enabled.into());
    }
    Ok(serde_json::json!({ "name": server.name, "config": config }))
}
