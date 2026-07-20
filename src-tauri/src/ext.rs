//! Generic helper for calling grok `x.ai/*` ACP extension methods.
//!
//! grok exposes Skills, MCP, and session-admin operations as extension
//! methods (see `xai-grok-shell/src/extensions/`). All of them go through the
//! same wire shape — `acp::ExtRequest { method, params: RawValue }` →
//! `acp::ExtResponse(Arc<RawValue>)`. This module centralizes the send/parse
//! so each feature module only has to declare its method + params + return type.

use std::sync::Arc;

use agent_client_protocol as acp;
use anyhow::{Result, anyhow};
use serde::de::DeserializeOwned;
use serde_json::value::RawValue;
use xai_acp_lib::{AcpAgentTx, acp_send};

/// Build a `RawValue` from a serializable value. Used to construct the `params`
/// payload for an ext request.
pub fn raw_params<T: serde::Serialize>(value: &T) -> Arc<RawValue> {
    // `to_raw_value` only fails for fundamentally un-serializable values (e.g.
    // maps with non-string keys); for our typed params this is infallible in
    // practice, so we unwrap.
    serde_json::value::to_raw_value(value)
        .expect("ext params serialization is infallible for typed inputs")
        .into()
}

/// Call a grok extension method (e.g. `x.ai/skills/list`) and return the
/// parsed response. Errors from the agent (method_not_found, invalid_request,
/// …) surface as `Err(anyhow!(...))` — callers decide whether to treat that
/// as fatal or fall back to an empty default.
pub async fn call_ext<T: DeserializeOwned>(
    tx: &AcpAgentTx,
    method: &str,
    params: Arc<RawValue>,
) -> Result<T> {
    let resp = call_ext_value(tx, method, params).await?;
    parse_ext_response(&resp).map_err(|e| anyhow!("ext {method}: parse response: {e}"))
}

/// Like [`call_ext`] but returns the raw `ExtResponse` without decoding.
/// Useful when the caller just needs a yes/no success signal (rename, delete,
/// toggle, …) and doesn't care about the (usually `{ "success": true }`) body.
pub async fn call_ext_value(
    tx: &AcpAgentTx,
    method: &str,
    params: Arc<RawValue>,
) -> Result<acp::ExtResponse> {
    let req = acp::ExtRequest::new(method, params);
    let resp: acp::ExtResponse = acp_send(req, tx)
        .await
        .map_err(|e| anyhow!("ext {method}: {e:?}"))?;
    Ok(resp)
}

/// Best-effort parse of an `ExtResponse` into a typed value. The response body
/// is a `RawValue` (arbitrary JSON from the agent); failures are mapped to a
/// plain `anyhow::Error` rather than panicking.
pub fn parse_ext_response<T: DeserializeOwned>(resp: &acp::ExtResponse) -> Result<T> {
    let raw_str = resp.0.get();
    serde_json::from_str(raw_str).map_err(|e| anyhow!("decode ext response: {e}"))
}
