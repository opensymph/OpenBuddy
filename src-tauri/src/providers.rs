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
