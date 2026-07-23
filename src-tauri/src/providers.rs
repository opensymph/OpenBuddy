//! Multi-provider API key configuration.
//!
//! grok's `[model.*]` config in `~/.grok/config.toml` natively supports
//! Anthropic / OpenAI / xAI / DeepSeek / 通义 / and any custom OpenAI-compatible
//! endpoint (see grok's `ApiBackend` enum: `chat_completions` | `responses` |
//! `messages`). We expose a typed façade over that file so the frontend can
//! list/save providers without learning TOML or grok's schema.
//!
//! Storage model: each provider maps to one `[model.<id>]` table. The API
//! key is written as `api_key` (grok's highest-priority credential source,
//! `agent/config.rs` priority chain: `api_key` > `env_key` > session token >
//! `XAI_API_KEY`). Keys live in plaintext on disk — same trust level as
//! grok's own `auth.json`.
//!
//! We **merge** rather than overwrite: any `[model.*]` / top-level keys we
//! don't recognize are preserved, so a user who hand-edits config.toml
//! doesn't lose their tweaks. We also **do not clobber manual tweaks** of
//! `base_url`/`api_backend`/`auth_scheme`: when a save request leaves those
//! fields as `None`, we keep whatever is already on disk instead of
//! resetting to the preset defaults.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use toml::map::Map;
use toml::Value;

/// One provider entry as the frontend sees it. `provider_kind` picks the
/// preset (endpoint + api_backend + auth_scheme); `model_id` is the
/// `[model.<id>]` key and also the model grok will request. `api_key` is the
/// secret — `None` means "leave whatever is on disk", empty string means
/// "clear it".
///
/// The advanced fields (`base_url` / `api_backend` / `auth_scheme` / `name`)
/// are `Option`: `None` = inherit from disk-or-preset, `Some(v)` = override.
/// This lets the "高级" section of the Add-Model dialog be optional while
/// still round-tripping manual edits losslessly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// `anthropic` | `openai` | `grok` | `deepseek` | `qwen` | `custom`.
    /// Drives the preset below. `custom` = no preset, all advanced fields
    /// must be supplied by the caller.
    pub provider_kind: String,
    /// The `[model.<id>]` key AND the model name sent in requests, e.g.
    /// `claude-sonnet-4-5`, `gpt-4o`, `grok-4`, `deepseek-chat`.
    pub model_id: String,
    /// Optional display label for the UI; defaults to model_id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// The secret. None = unchanged, Some("") = cleared, Some("x") = set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Override the preset base_url. None = use disk value or preset fallback.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Override the preset api_backend.
    /// Must be `"chat_completions"` | `"responses"` | `"messages"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_backend: Option<String>,
    /// Override the preset auth_scheme.
    /// Must be `"bearer"` | `"x_api_key"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<String>,
    /// Human-readable display name (grok's `name` field, used in selectors).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Built-in presets keyed by provider_kind. Endpoint + wire protocol per
/// provider. `auth_scheme` decides the HTTP auth header:
/// `bearer` (Authorization: Bearer) for OpenAI/xAI/DeepSeek/通义,
/// `x_api_key` (x-api-key) for Anthropic.
struct ProviderPreset {
    base_url: &'static str,
    api_backend: &'static str,
    auth_scheme: &'static str,
}

fn preset(kind: &str) -> Option<ProviderPreset> {
    match kind {
        "anthropic" => Some(ProviderPreset {
            base_url: "https://api.anthropic.com/v1",
            api_backend: "messages",
            auth_scheme: "x_api_key",
        }),
        "openai" => Some(ProviderPreset {
            base_url: "https://api.openai.com/v1",
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "grok" => Some(ProviderPreset {
            base_url: "https://api.x.ai/v1",
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "deepseek" => Some(ProviderPreset {
            base_url: "https://api.deepseek.com",
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "qwen" => Some(ProviderPreset {
            // 通义千问 OpenAI-compatible endpoint.
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        // `custom` intentionally has no preset — caller must supply every field.
        _ => None,
    }
}

/// Reverse-map a `[model.*]` table back to a provider_kind by sniffing
/// base_url + api_backend. Falls back to `custom` for anything unrecognized
/// so we never silently drop a user's entry.
fn infer_provider_kind(table: &Map<String, Value>) -> String {
    let backend = table
        .get("api_backend")
        .and_then(Value::as_str)
        .unwrap_or("");
    let base = table
        .get("base_url")
        .and_then(Value::as_str)
        .unwrap_or("");
    match backend {
        "messages" => "anthropic".into(),
        "chat_completions" | "responses" => {
            if base.contains("api.x.ai") {
                "grok".into()
            } else if base.contains("api.openai.com") {
                "openai".into()
            } else if base.contains("api.deepseek.com") {
                "deepseek".into()
            } else if base.contains("dashscope.aliyuncs.com") {
                "qwen".into()
            } else {
                "custom".into()
            }
        }
        _ => "custom".into(),
    }
}

/// Validate an api_backend value. Empty string (treat as "unset") is allowed.
fn validate_api_backend(v: &str) -> Result<(), String> {
    match v {
        "" | "chat_completions" | "responses" | "messages" => Ok(()),
        other => Err(format!(
            "invalid api_backend '{other}': must be chat_completions | responses | messages"
        )),
    }
}

/// Validate an auth_scheme value. Empty string (treat as "unset") is allowed.
fn validate_auth_scheme(v: &str) -> Result<(), String> {
    match v {
        "" | "bearer" | "x_api_key" => Ok(()),
        other => Err(format!(
            "invalid auth_scheme '{other}': must be bearer | x_api_key"
        )),
    }
}

/// Resolve `~/.grok` (or `$GROK_HOME`). Matches `sessions.rs` / `commands.rs`.
fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".grok")
}

fn config_path() -> PathBuf {
    grok_home().join("config.toml")
}

/// Read config.toml as a TOML value, or an empty table if missing/corrupt.
/// (Corrupt → back up to `config.toml.corrupt.<millis>` so we don't silently
/// clobber the user's file — mirrors grok's own auth.json handling.)
///
/// Exposed `pub(crate)` so sibling modules (permission_config) can reuse the
/// same atomic read-modify-write pattern without each re-implementing it.
pub(crate) fn read_config() -> Value {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(s) => match s.parse::<Value>() {
            Ok(v) => v,
            Err(_) => {
                let _ = std::fs::rename(
                    &path,
                    path.with_extension(format!(
                        "toml.corrupt.{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis())
                            .unwrap_or(0)
                    )),
                );
                Value::Table(Map::new())
            }
        },
        Err(_) => Value::Table(Map::new()),
    }
}

/// Atomic write: tmp file in the same dir, then rename. Falls back to direct
/// write if rename fails (e.g. antivirus interference) so we still make progress.
pub(crate) fn write_config(v: &Value) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let body = toml::to_string_pretty(v).map_err(|e| format!("serialize config: {e}"))?;
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, &body).map_err(|e| format!("write config tmp: {e}"))?;
    if std::fs::rename(&tmp, &path).is_err() {
        std::fs::write(&path, &body).map_err(|e| format!("write config: {e}"))?;
    }
    Ok(())
}

/// Pull our managed providers out of the `[model.*]` subtables. Every entry
/// with an `api_backend` is surfaced (we no longer drop unrecognized backends
/// — they come back as `provider_kind: "custom"`). Advanced fields are
/// back-filled so the UI can display and edit them.
fn extract_providers(models: &Map<String, Value>) -> Vec<ProviderConfig> {
    let mut out = Vec::new();
    for (model_id, v) in models {
        let Some(table) = v.as_table() else { continue };
        // Skip entries with no api_backend AND no api_key — those aren't
        // provider entries we manage (could be a bare model override).
        let has_backend = table.contains_key("api_backend");
        let has_key = table.contains_key("api_key") || table.contains_key("env_key");
        if !has_backend && !has_key {
            continue;
        }
        let kind = infer_provider_kind(table);
        out.push(ProviderConfig {
            provider_kind: kind,
            model_id: model_id.clone(),
            label: None,
            // Mask the key for the UI — never echo secrets back to the frontend.
            api_key: if has_key { Some("••••".into()) } else { None },
            base_url: table
                .get("base_url")
                .and_then(Value::as_str)
                .map(String::from),
            api_backend: table
                .get("api_backend")
                .and_then(Value::as_str)
                .map(String::from),
            auth_scheme: table
                .get("auth_scheme")
                .and_then(Value::as_str)
                .map(String::from),
            name: table.get("name").and_then(Value::as_str).map(String::from),
        });
    }
    out
}

/// Resolve a single field for writing using the priority chain:
///   explicit (Some) > existing disk value > preset default > error.
fn resolve_field(
    explicit: &Option<String>,
    existing: Option<&Value>,
    preset_val: Option<&'static str>,
    field_name: &str,
    is_custom: bool,
) -> Result<String, String> {
    if let Some(v) = explicit {
        if !v.is_empty() {
            return Ok(v.clone());
        }
    }
    if let Some(v) = existing.and_then(Value::as_str) {
        return Ok(v.to_string());
    }
    if let Some(p) = preset_val {
        return Ok(p.to_string());
    }
    if is_custom {
        Err(format!(
            "custom provider is missing required field '{field_name}' (set it in the Advanced section)"
        ))
    } else {
        Err(format!("internal error: no preset for {field_name}"))
    }
}

/// Render one provider into a TOML table value matching grok's schema.
/// Preserves all unrecognized keys the user may have added (extra_headers,
/// reasoning_effort, temperature, ...) by starting from the existing table.
fn provider_to_table(
    p: &ProviderConfig,
    existing: Option<&Value>,
) -> Result<Value, String> {
    let preset = preset(&p.provider_kind);
    let is_custom = p.provider_kind == "custom";

    // Validate advanced fields up front (empty = unset, allowed).
    if let Some(b) = &p.api_backend {
        validate_api_backend(b)?;
    }
    if let Some(s) = &p.auth_scheme {
        validate_auth_scheme(s)?;
    }

    // Start from the existing table if present (preserve user-added keys like
    // extra_headers / reasoning_effort / temperature), else fresh.
    let mut table = match existing.and_then(Value::as_table) {
        Some(t) => t.clone(),
        None => Map::new(),
    };

    let existing_str = |key: &str| existing.and_then(Value::as_table).and_then(|t| t.get(key));

    let base_url = resolve_field(
        &p.base_url,
        existing_str("base_url"),
        preset.as_ref().map(|p| p.base_url),
        "base_url",
        is_custom,
    )?;
    let api_backend = resolve_field(
        &p.api_backend,
        existing_str("api_backend"),
        preset.as_ref().map(|p| p.api_backend),
        "api_backend",
        is_custom,
    )?;
    let auth_scheme = resolve_field(
        &p.auth_scheme,
        existing_str("auth_scheme"),
        preset.as_ref().map(|p| p.auth_scheme),
        "auth_scheme",
        is_custom,
    )?;

    table.insert("base_url".into(), Value::String(base_url));
    table.insert("api_backend".into(), Value::String(api_backend));
    table.insert("auth_scheme".into(), Value::String(auth_scheme));

    // Optional display name.
    if let Some(name) = &p.name {
        if !name.is_empty() {
            table.insert("name".into(), Value::String(name.clone()));
        }
    }

    // Only touch api_key when the caller supplied one. Some("") clears it.
    if let Some(key) = &p.api_key {
        if key.is_empty() {
            table.remove("api_key");
        } else if key.starts_with('•') {
            // "••••" is the mask coming back from the UI — treat as no-op.
            // (A real key never starts with •.)
        } else {
            table.insert("api_key".into(), Value::String(key.clone()));
        }
    }

    Ok(Value::Table(table))
}

// ---------- Tauri commands ----------

/// List currently configured providers. Empty list = nothing configured yet.
#[tauri::command]
pub fn providers_list() -> Vec<ProviderConfig> {
    let config = read_config();
    let models = config
        .as_table()
        .and_then(|t| t.get("model"))
        .and_then(Value::as_table);
    match models {
        Some(m) => extract_providers(m),
        None => Vec::new(),
    }
}

/// Save (merge) providers into config.toml. Preserves all unrecognized keys.
#[tauri::command]
pub fn providers_save(
    _state: State<'_, crate::commands::AppState>,
    providers: Vec<ProviderConfig>,
) -> Result<(), String> {
    let mut config = read_config();
    // Ensure top-level `model` table exists.
    {
        let table = config.as_table_mut().ok_or("config root not a table")?;
        if !table.contains_key("model") {
            table.insert("model".into(), Value::Table(Map::new()));
        }
    }
    let models = config
        .get_mut("model")
        .and_then(Value::as_table_mut)
        .ok_or("config.model not a table")?;

    for p in &providers {
        let existing = models.get(&p.model_id);
        // If api_key is None (unchanged) and there's no existing entry to
        // preserve, skip — no point writing a keyless stub.
        let existing_table = existing;
        let has_existing = existing_table
            .and_then(Value::as_table)
            .map(|t| t.contains_key("api_key") || t.contains_key("env_key"))
            .unwrap_or(false);
        if p.api_key.is_none() && !has_existing {
            // Still allow it through if advanced fields are set (creating a
            // keyless entry that reads from env, say). provider_to_table will
            // error if a custom preset is missing required fields.
        }
        let rendered = provider_to_table(p, existing_table)?;
        models.insert(p.model_id.clone(), rendered);
    }

    // Auto-sync [models] session_summary with default when unset.
    // In BYOK setups the compiled-in title-generation model (grok-4.5) is
    // unreachable; mirroring the user's default model makes LLM-generated
    // session titles work out of the box.
    if let Some(models_table) = config.get_mut("models").and_then(Value::as_table_mut) {
        let has_summary = models_table.contains_key("session_summary");
        if !has_summary {
            if let Some(default) = models_table.get("default").and_then(Value::as_str) {
                models_table.insert(
                    "session_summary".into(),
                    Value::String(default.to_owned()),
                );
            }
        }
    }

    write_config(&config)
}

/// Delete a `[model.<id>]` entry entirely.
#[tauri::command]
pub fn providers_delete(model_id: String) -> Result<(), String> {
    let mut config = read_config();
    let removed = config
        .as_table_mut()
        .and_then(|t| t.get_mut("model"))
        .and_then(Value::as_table_mut)
        .and_then(|m| m.remove(&model_id))
        .is_some();
    if removed {
        write_config(&config)?;
    }
    Ok(())
}

// ---------- remote model discovery ----------

/// One model entry returned by a provider's `GET /models` endpoint.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModel {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by: Option<String>,
}

/// Resolve the effective base_url for a fetch, given the provider kind and an
/// optional override. Presets provide the default; `custom` requires the caller
/// to supply `base_url`.
fn resolve_fetch_base_url(kind: &str, base_url: &Option<String>) -> Result<String, String> {
    if let Some(url) = base_url {
        let trimmed = url.trim().trim_end_matches('/');
        if trimmed.is_empty() {
            return Err("base_url 不能为空".into());
        }
        return Ok(trimmed.to_string());
    }
    match preset(kind) {
        Some(p) => Ok(p.base_url.trim_end_matches('/').to_string()),
        None => Err("自定义提供商必须填写 Base URL".into()),
    }
}

/// Fetch the list of available models from a provider's `/models` endpoint.
///
/// Works for any OpenAI-compatible endpoint (`GET {base_url}/models` returning
/// `{"data":[{"id":"...","owned_by":"..."}]}`) and for Anthropic (same path,
/// but requires `anthropic-version` header + `x-api-key` auth).
///
/// The `api_key` is used only for this single request — it is never persisted
/// or logged.
#[tauri::command]
pub async fn providers_fetch_models(
    provider_kind: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<Vec<FetchedModel>, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("请先填写 API Key".into());
    }

    let base = resolve_fetch_base_url(&provider_kind, &base_url)?;
    let auth_scheme = preset(&provider_kind)
        .map(|p| p.auth_scheme.to_string())
        .unwrap_or_else(|| "bearer".into());

    let url = format!("{base}/models");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))?;

    let mut req = client.get(&url);
    // Auth header per the provider's scheme.
    req = match auth_scheme.as_str() {
        "x_api_key" => req
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
        _ => req.header("Authorization", format!("Bearer {key}")),
    };

    let resp = req
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let snippet = if body.len() > 200 {
            format!("{}…", &body[..body.char_indices().take(200).last().map(|(i, _)| i).unwrap_or(200)])
        } else {
            body
        };
        return Err(format!("API 返回 {status}：{snippet}"));
    }

    // Parse the OpenAI-compatible `{ "data": [{ "id": "…", "owned_by": "…" }] }` shape.
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败（非 JSON）：{e}"))?;

    let data = json
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| "响应缺少 data 数组（该端点可能不支持 /models 列表）".to_string())?;

    let models = data
        .iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(|v| v.as_str())?.to_string();
            if id.is_empty() {
                return None;
            }
            let owned_by = item
                .get("owned_by")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            Some(FetchedModel { id, owned_by })
        })
        .collect::<Vec<_>>();

    Ok(models)
}

// ---------- unit tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    // --- infer_provider_kind ---

    #[test]
    fn infer_anthropic_from_messages_backend() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("messages".into()));
        table.insert("base_url".into(), Value::String("https://api.anthropic.com/v1".into()));
        assert_eq!(infer_provider_kind(&table), "anthropic");
    }

    #[test]
    fn infer_grok_from_xai_url() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://api.x.ai/v1".into()));
        assert_eq!(infer_provider_kind(&table), "grok");
    }

    #[test]
    fn infer_openai() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        assert_eq!(infer_provider_kind(&table), "openai");
    }

    #[test]
    fn infer_deepseek() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://api.deepseek.com".into()));
        assert_eq!(infer_provider_kind(&table), "deepseek");
    }

    #[test]
    fn infer_qwen() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://dashscope.aliyuncs.com/compatible-mode/v1".into()));
        assert_eq!(infer_provider_kind(&table), "qwen");
    }

    #[test]
    fn infer_custom_for_unknown() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://my-custom.api/v1".into()));
        assert_eq!(infer_provider_kind(&table), "custom");
    }

    #[test]
    fn infer_custom_for_missing_backend() {
        let table = Map::new();
        assert_eq!(infer_provider_kind(&table), "custom");
    }

    // --- validate_api_backend ---

    #[test]
    fn validate_api_backend_valid() {
        assert!(validate_api_backend("").is_ok());
        assert!(validate_api_backend("chat_completions").is_ok());
        assert!(validate_api_backend("responses").is_ok());
        assert!(validate_api_backend("messages").is_ok());
    }

    #[test]
    fn validate_api_backend_invalid() {
        assert!(validate_api_backend("graphql").is_err());
        assert!(validate_api_backend("CHAT").is_err());
    }

    // --- validate_auth_scheme ---

    #[test]
    fn validate_auth_scheme_valid() {
        assert!(validate_auth_scheme("").is_ok());
        assert!(validate_auth_scheme("bearer").is_ok());
        assert!(validate_auth_scheme("x_api_key").is_ok());
    }

    #[test]
    fn validate_auth_scheme_invalid() {
        assert!(validate_auth_scheme("basic").is_err());
        assert!(validate_auth_scheme("Bearer").is_err());
    }

    // --- extract_providers ---

    #[test]
    fn extract_providers_parses_model_table() {
        let mut models = Map::new();
        let mut entry = Map::new();
        entry.insert("api_backend".into(), Value::String("messages".into()));
        entry.insert("base_url".into(), Value::String("https://api.anthropic.com/v1".into()));
        entry.insert("api_key".into(), Value::String("sk-ant-xxx".into()));
        entry.insert("auth_scheme".into(), Value::String("x_api_key".into()));
        models.insert("claude-sonnet-4-5".into(), Value::Table(entry));

        let providers = extract_providers(&models);
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].model_id, "claude-sonnet-4-5");
        assert_eq!(providers[0].provider_kind, "anthropic");
        // Key is masked
        assert_eq!(providers[0].api_key.as_deref(), Some("••••"));
    }

    #[test]
    fn extract_providers_skips_entries_without_backend_or_key() {
        let mut models = Map::new();
        // A bare model override with no api_backend and no api_key
        let mut entry = Map::new();
        entry.insert("temperature".into(), Value::String("0.7".into()));
        models.insert("some-model".into(), Value::Table(entry));

        let providers = extract_providers(&models);
        assert_eq!(providers.len(), 0);
    }

    // --- resolve_field ---

    #[test]
    fn resolve_field_explicit_wins() {
        let result = resolve_field(
            &Some("https://custom.api".into()),
            Some(&Value::String("https://old.api".into())),
            Some("https://preset.api"),
            "base_url",
            false,
        );
        assert_eq!(result.unwrap(), "https://custom.api");
    }

    #[test]
    fn resolve_field_existing_wins_over_preset() {
        let result = resolve_field(
            &None,
            Some(&Value::String("https://existing.api".into())),
            Some("https://preset.api"),
            "base_url",
            false,
        );
        assert_eq!(result.unwrap(), "https://existing.api");
    }

    #[test]
    fn resolve_field_preset_fallback() {
        let result = resolve_field(
            &None,
            None,
            Some("https://preset.api"),
            "base_url",
            false,
        );
        assert_eq!(result.unwrap(), "https://preset.api");
    }

    #[test]
    fn resolve_field_custom_missing_errors() {
        let result = resolve_field(&None, None, None, "base_url", true);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("custom provider"));
    }

    #[test]
    fn resolve_field_empty_explicit_falls_through() {
        let result = resolve_field(
            &Some("".into()),
            Some(&Value::String("https://existing.api".into())),
            Some("https://preset.api"),
            "base_url",
            false,
        );
        assert_eq!(result.unwrap(), "https://existing.api");
    }

    // --- provider_to_table ---

    #[test]
    fn provider_to_table_anthropic_preset() {
        let p = ProviderConfig {
            provider_kind: "anthropic".into(),
            model_id: "claude-sonnet-4-5".into(),
            label: None,
            api_key: Some("sk-ant-test".into()),
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            name: None,
        };
        let result = provider_to_table(&p, None).unwrap();
        let table = result.as_table().unwrap();
        assert_eq!(table["base_url"].as_str().unwrap(), "https://api.anthropic.com/v1");
        assert_eq!(table["api_backend"].as_str().unwrap(), "messages");
        assert_eq!(table["auth_scheme"].as_str().unwrap(), "x_api_key");
        assert_eq!(table["api_key"].as_str().unwrap(), "sk-ant-test");
    }

    #[test]
    fn provider_to_table_preserves_existing_keys() {
        let mut existing_table = Map::new();
        existing_table.insert("base_url".into(), Value::String("https://api.anthropic.com/v1".into()));
        existing_table.insert("api_backend".into(), Value::String("messages".into()));
        existing_table.insert("auth_scheme".into(), Value::String("x_api_key".into()));
        existing_table.insert("api_key".into(), Value::String("old-key".into()));
        existing_table.insert("temperature".into(), Value::String("0.5".into()));
        let existing = Value::Table(existing_table);

        let p = ProviderConfig {
            provider_kind: "anthropic".into(),
            model_id: "claude-sonnet-4-5".into(),
            label: None,
            api_key: Some("new-key".into()),
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            name: None,
        };
        let result = provider_to_table(&p, Some(&existing)).unwrap();
        let table = result.as_table().unwrap();
        // User-added key preserved
        assert_eq!(table["temperature"].as_str().unwrap(), "0.5");
        // Key updated
        assert_eq!(table["api_key"].as_str().unwrap(), "new-key");
    }

    #[test]
    fn provider_to_table_masked_key_is_noop() {
        let mut existing_table = Map::new();
        existing_table.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        existing_table.insert("api_backend".into(), Value::String("chat_completions".into()));
        existing_table.insert("auth_scheme".into(), Value::String("bearer".into()));
        existing_table.insert("api_key".into(), Value::String("real-key".into()));
        let existing = Value::Table(existing_table);

        let p = ProviderConfig {
            provider_kind: "openai".into(),
            model_id: "gpt-4o".into(),
            label: None,
            api_key: Some("••••".into()), // masked
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            name: None,
        };
        let result = provider_to_table(&p, Some(&existing)).unwrap();
        let table = result.as_table().unwrap();
        // Key unchanged (mask is a no-op)
        assert_eq!(table["api_key"].as_str().unwrap(), "real-key");
    }

    #[test]
    fn provider_to_table_empty_key_clears() {
        let mut existing_table = Map::new();
        existing_table.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        existing_table.insert("api_backend".into(), Value::String("chat_completions".into()));
        existing_table.insert("auth_scheme".into(), Value::String("bearer".into()));
        existing_table.insert("api_key".into(), Value::String("old-key".into()));
        let existing = Value::Table(existing_table);

        let p = ProviderConfig {
            provider_kind: "openai".into(),
            model_id: "gpt-4o".into(),
            label: None,
            api_key: Some("".into()), // clear
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            name: None,
        };
        let result = provider_to_table(&p, Some(&existing)).unwrap();
        let table = result.as_table().unwrap();
        assert!(!table.contains_key("api_key"));
    }

    #[test]
    fn provider_to_table_custom_missing_field_errors() {
        let p = ProviderConfig {
            provider_kind: "custom".into(),
            model_id: "my-model".into(),
            label: None,
            api_key: None,
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            name: None,
        };
        let result = provider_to_table(&p, None);
        assert!(result.is_err());
    }

    // --- preset ---

    #[test]
    fn preset_known_kinds() {
        assert!(preset("anthropic").is_some());
        assert!(preset("openai").is_some());
        assert!(preset("grok").is_some());
        assert!(preset("deepseek").is_some());
        assert!(preset("qwen").is_some());
    }

    #[test]
    fn preset_custom_is_none() {
        assert!(preset("custom").is_none());
        assert!(preset("unknown").is_none());
    }
}
