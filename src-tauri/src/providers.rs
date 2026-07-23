//! Multi-provider API key configuration.
//!
//! grok's config in `~/.grok/config.toml` natively supports two separate
//! concepts that together model "one provider, many models":
//!
//!   - `[model_providers.<id>]` — a connection/auth profile (base_url,
//!     api_key, api_backend, auth_scheme, context_window, extra_headers).
//!   - `[model.<id>]` — a single model catalog entry that may reference a
//!     provider via `model_provider = "<id>"`, inheriting its connection
//!     config. grok merges the provider defaults into each model in
//!     `resolve_model_list` (see vendor/.../config.rs).
//!
//! This is grok's recommended shape for BYOK: one key/url stored once per
//! provider, shared by every model that points at it. We expose a typed façade
//! over that file so the frontend can list/save without learning TOML or
//! grok's schema.
//!
//! Storage rules:
//!   - Keys live in plaintext on disk — same trust level as grok's own
//!     `auth.json`. `api_key` is grok's highest-priority credential source.
//!   - We **merge** rather than overwrite: any keys we don't recognize are
//!     preserved, so a user who hand-edits config.toml doesn't lose tweaks.
//!   - **Lazy migration**: legacy `[model.*]` tables that still carry their
//!     own `api_key`/`base_url` (the old "one table per model" shape) are
//!     grouped for *display* by base_url+api_key into synthetic providers,
//!     but the disk file is only rewritten when the user actively saves.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use toml::map::Map;
use toml::Value;

// ---------------------------------------------------------------------------
// Built-in presets (endpoint + wire protocol per provider_kind).
// ---------------------------------------------------------------------------

/// Built-in preset: endpoint + wire protocol + auth header style per provider.
/// `base_url` is None for "custom-like" kinds (custom / custom_anthropic) where
/// the user must supply the endpoint, but the protocol/auth are still preset.
struct ProviderPreset {
    base_url: Option<&'static str>,
    api_backend: &'static str,
    auth_scheme: &'static str,
}

fn preset(kind: &str) -> Option<ProviderPreset> {
    match kind {
        "anthropic" => Some(ProviderPreset {
            base_url: Some("https://api.anthropic.com/v1"),
            api_backend: "messages",
            auth_scheme: "x_api_key",
        }),
        "openai" => Some(ProviderPreset {
            base_url: Some("https://api.openai.com/v1"),
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "grok" => Some(ProviderPreset {
            base_url: Some("https://api.x.ai/v1"),
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "deepseek" => Some(ProviderPreset {
            base_url: Some("https://api.deepseek.com"),
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        "qwen" => Some(ProviderPreset {
            // 通义千问 OpenAI-compatible endpoint.
            base_url: Some("https://dashscope.aliyuncs.com/compatible-mode/v1"),
            api_backend: "chat_completions",
            auth_scheme: "bearer",
        }),
        // Anthropic-compatible custom endpoint: protocol/auth locked to the
        // Anthropic wire shape, but the user must supply base_url.
        "custom_anthropic" => Some(ProviderPreset {
            base_url: None,
            api_backend: "messages",
            auth_scheme: "x_api_key",
        }),
        // `custom` (OpenAI-compatible) intentionally has no preset at all —
        // caller must supply every field.
        _ => None,
    }
}

/// Reverse-map a provider by sniffing base_url + api_backend. Falls back to
/// `custom` for anything unrecognized so we never silently drop a user's entry.
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

// ---------------------------------------------------------------------------
// Config I/O (shared with sibling modules).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Frontend-facing data model: providers + models.
// ---------------------------------------------------------------------------

/// One connection/auth profile as the frontend sees it. Written to
/// `[model_providers.<id>]`. `api_key`: None = unchanged, Some("") = cleared,
/// Some("x") = set. When read back it is masked as `"••••"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderEntry {
    /// The `[model_providers.<id>]` key; models reference it via
    /// `model_provider = "<id>"`. Stable id derived from provider_kind.
    pub id: String,
    /// `anthropic` | `openai` | `grok` | `deepseek` | `qwen` | `custom`.
    pub provider_kind: String,
    /// Optional display label for the UI (not persisted to TOML; derived).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// The secret. None = unchanged, Some("") = cleared, Some("x") = set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<String>,
    /// Max context window in tokens. grok accepts this at the provider level
    /// (shared by all referencing models) — see ModelProviderConfig.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
}

/// One model catalog entry as the frontend sees it. Written to
/// `[model.<model_id>]` with a `model_provider` reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    /// The `[model.<id>]` key AND the model slug sent in requests.
    pub model_id: String,
    /// References `[model_providers.<id>]`.
    pub provider_id: String,
    /// Human-readable display name (grok's `name` field, used in selectors).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Per-model context-window override (wins over the provider's value).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
}

/// The list result: every provider + every model, joined by `provider_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListModel {
    pub providers: Vec<ModelProviderEntry>,
    pub models: Vec<ModelEntry>,
}

// ---------------------------------------------------------------------------
// Read path (with lazy grouping of legacy per-model entries).
// ---------------------------------------------------------------------------

/// Mask helper: returns `Some("••••")` when the table carries a key, else None.
fn masked_key(table: &Map<String, Value>) -> Option<String> {
    if table.contains_key("api_key") || table.contains_key("env_key") {
        Some("••••".into())
    } else {
        None
    }
}

/// Read a `[model_providers.<id>]` table into an entry. The api_key is masked.
fn provider_from_table(id: &str, table: &Map<String, Value>) -> ModelProviderEntry {
    ModelProviderEntry {
        id: id.to_string(),
        provider_kind: infer_provider_kind(table),
        label: None,
        api_key: masked_key(table),
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
        context_window: table.get("context_window").and_then(Value::as_integer).map(|n| n as u64),
    }
}

/// Group legacy `[model.*]` entries (those carrying their own key/url, i.e. the
/// old per-model shape) into synthetic providers keyed by `base_url|api_key`.
/// Returns (synthetic_providers, synthetic_models). Disk is NOT modified.
///
/// Each group's id is derived from its provider_kind, de-duplicated against the
/// `taken_ids` set so two different custom endpoints don't collide.
fn group_legacy_models(
    models: &Map<String, Value>,
    taken_ids: &mut std::collections::HashSet<String>,
) -> (Vec<ModelProviderEntry>, Vec<ModelEntry>) {
    // group_key -> (provider_kind, base_url, first table for field inference)
    use std::collections::BTreeMap;
    let mut groups: BTreeMap<String, (String, String)> = BTreeMap::new();
    let mut group_order: Vec<String> = Vec::new();
    // group_key -> [model_id]
    let mut members: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for (model_id, v) in models {
        let Some(table) = v.as_table() else { continue };
        // Only legacy entries that carry their own connection config.
        let has_key = table.contains_key("api_key") || table.contains_key("env_key");
        let has_url = table.contains_key("base_url");
        if !has_key && !has_url {
            continue;
        }
        // Skip entries already migrated (they reference a provider).
        if table.contains_key("model_provider") {
            continue;
        }
        let base_url = table
            .get("base_url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let key_sig = if has_key { "key" } else { "nokey" };
        let group_key = format!("{base_url}|{key_sig}");
        if !groups.contains_key(&group_key) {
            let kind = infer_provider_kind(table);
            groups.insert(group_key.clone(), (kind, base_url.clone()));
            group_order.push(group_key.clone());
        }
        members
            .entry(group_key.clone())
            .or_default()
            .push(model_id.clone());
    }

    let mut providers = Vec::new();
    let mut out_models = Vec::new();
    for gk in group_order {
        let (kind, base_url) = groups[&gk].clone();
        let id = allocate_provider_id(&kind, taken_ids);
        // Determine representative fields from the first member's table.
        let first_table = members[&gk]
            .first()
            .and_then(|mid| models.get(mid))
            .and_then(Value::as_table);
        providers.push(ModelProviderEntry {
            id: id.clone(),
            provider_kind: kind,
            label: None,
            api_key: first_table.and_then(|t| masked_key(t)),
            base_url: Some(base_url),
            api_backend: first_table
                .and_then(|t| t.get("api_backend"))
                .and_then(Value::as_str)
                .map(String::from),
            auth_scheme: first_table
                .and_then(|t| t.get("auth_scheme"))
                .and_then(Value::as_str)
                .map(String::from),
            context_window: first_table
                .and_then(|t| t.get("context_window"))
                .and_then(Value::as_integer)
                .map(|n| n as u64),
        });
        for mid in &members[&gk] {
            let table = models
                .get(mid)
                .and_then(Value::as_table)
                .expect("checked above");
            out_models.push(ModelEntry {
                model_id: mid.clone(),
                provider_id: id.clone(),
                name: table.get("name").and_then(Value::as_str).map(String::from),
                context_window: table
                    .get("context_window")
                    .and_then(Value::as_integer)
                    .map(|n| n as u64),
            });
        }
    }
    (providers, out_models)
}

/// Produce a stable, human-readable provider id that isn't already taken.
/// `openai`, then `openai-2`, `openai-3`, ... Inserts the chosen id into
/// `taken` so successive calls within one read don't collide.
fn allocate_provider_id(
    kind: &str,
    taken: &mut std::collections::HashSet<String>,
) -> String {
    if !taken.contains(kind) {
        taken.insert(kind.to_string());
        return kind.to_string();
    }
    let mut n = 2;
    loop {
        let candidate = format!("{kind}-{n}");
        if !taken.contains(&candidate) {
            taken.insert(candidate.clone());
            return candidate;
        }
        n += 1;
    }
}

// ---------------------------------------------------------------------------
// Write helpers.
// ---------------------------------------------------------------------------

/// Resolve a single field using the priority chain:
///   explicit (non-empty Some) > existing disk value > preset default > error.
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

/// Render a `[model_providers.<id>]` table from an entry, preserving any
/// unrecognized keys already on disk.
fn provider_to_table(
    p: &ModelProviderEntry,
    existing: Option<&Value>,
) -> Result<Value, String> {
    let preset = preset(&p.provider_kind);
    // "Custom-like" kinds (custom / custom_anthropic) have no preset base_url,
    // so base_url must be user-supplied → a missing one is a hard error.
    let needs_base_url = preset.as_ref().and_then(|p| p.base_url).is_none();

    if let Some(b) = &p.api_backend {
        validate_api_backend(b)?;
    }
    if let Some(s) = &p.auth_scheme {
        validate_auth_scheme(s)?;
    }

    let mut table = match existing.and_then(Value::as_table) {
        Some(t) => t.clone(),
        None => Map::new(),
    };
    let existing_str = |key: &str| existing.and_then(Value::as_table).and_then(|t| t.get(key));

    let base_url = resolve_field(
        &p.base_url,
        existing_str("base_url"),
        preset.as_ref().and_then(|p| p.base_url),
        "base_url",
        needs_base_url,
    )?;
    let api_backend = resolve_field(
        &p.api_backend,
        existing_str("api_backend"),
        preset.as_ref().map(|p| p.api_backend),
        "api_backend",
        needs_base_url,
    )?;
    let auth_scheme = resolve_field(
        &p.auth_scheme,
        existing_str("auth_scheme"),
        preset.as_ref().map(|p| p.auth_scheme),
        "auth_scheme",
        needs_base_url,
    )?;

    table.insert("base_url".into(), Value::String(base_url));
    table.insert("api_backend".into(), Value::String(api_backend));
    table.insert("auth_scheme".into(), Value::String(auth_scheme));

    if let Some(cw) = p.context_window {
        table.insert("context_window".into(), Value::Integer(cw as i64));
    }

    // Only touch api_key when the caller supplied one. Some("") clears it.
    if let Some(key) = &p.api_key {
        if key.is_empty() {
            table.remove("api_key");
        } else if key.starts_with('•') {
            // Mask coming back from the UI — treat as no-op.
        } else {
            table.insert("api_key".into(), Value::String(key.clone()));
        }
    }

    Ok(Value::Table(table))
}

/// Render a `[model.<id>]` table from an entry. Connection config lives on the
/// provider now, so we strip any legacy base_url/api_key/api_backend/auth_scheme
/// the table may have carried (migration). Preserves unrecognized keys.
fn model_to_table(m: &ModelEntry, existing: Option<&Value>) -> Value {
    let mut table = match existing.and_then(Value::as_table) {
        Some(t) => t.clone(),
        None => Map::new(),
    };

    // The model slug grok will request. Defaults to the table key when absent.
    table.insert("model".into(), Value::String(m.model_id.clone()));
    // Reference the provider for connection/auth config.
    table.insert("model_provider".into(), Value::String(m.provider_id.clone()));

    if let Some(name) = &m.name {
        if name.is_empty() {
            table.remove("name");
        } else {
            table.insert("name".into(), Value::String(name.clone()));
        }
    } else {
        table.remove("name");
    }

    if let Some(cw) = m.context_window {
        table.insert("context_window".into(), Value::Integer(cw as i64));
    } else {
        // Per-model override cleared → fall back to provider's value.
        table.remove("context_window");
    }

    // Migrate away legacy per-model connection fields (now on the provider).
    for k in ["base_url", "api_key", "api_backend", "auth_scheme", "env_key"] {
        table.remove(k);
    }

    Value::Table(table)
}

/// Ensure a top-level table exists in the config root, returning a mut ref.
fn ensure_table<'a>(config: &'a mut Value, key: &str) -> Result<&'a mut Map<String, Value>, String> {
    let root = config
        .as_table_mut()
        .ok_or_else(|| format!("config root not a table"))?;
    if !root.contains_key(key) {
        root.insert(key.into(), Value::Table(Map::new()));
    }
    root.get_mut(key)
        .and_then(Value::as_table_mut)
        .ok_or_else(|| format!("config.{key} not a table"))
}

// ---------------------------------------------------------------------------
// Tauri commands.
// ---------------------------------------------------------------------------

/// List configured providers + models. Legacy per-model entries are grouped
/// into synthetic providers for display; disk is not modified.
#[tauri::command]
pub fn providers_list() -> ProviderListModel {
    let config = read_config();

    let mut providers = Vec::new();
    let mut models = Vec::new();
    let mut taken_ids = std::collections::HashSet::new();

    // 1) Real [model_providers.*] entries.
    if let Some(mps) = config
        .as_table()
        .and_then(|t| t.get("model_providers"))
        .and_then(Value::as_table)
    {
        for (id, v) in mps {
            let Some(table) = v.as_table() else { continue };
            taken_ids.insert(id.clone());
            providers.push(provider_from_table(id, table));
        }
    }

    // 2) Models that reference a provider.
    if let Some(mdls) = config
        .as_table()
        .and_then(|t| t.get("model"))
        .and_then(Value::as_table)
    {
        for (model_id, v) in mdls {
            let Some(table) = v.as_table() else { continue };
            if let Some(pid) = table.get("model_provider").and_then(Value::as_str) {
                models.push(ModelEntry {
                    model_id: model_id.clone(),
                    provider_id: pid.to_string(),
                    name: table.get("name").and_then(Value::as_str).map(String::from),
                    context_window: table
                        .get("context_window")
                        .and_then(Value::as_integer)
                        .map(|n| n as u64),
                });
            }
        }
    }

    // 3) Legacy per-model entries → grouped synthetic providers (display only).
    if let Some(mdls) = config
        .as_table()
        .and_then(|t| t.get("model"))
        .and_then(Value::as_table)
    {
        let (mut synth_p, mut synth_m) = group_legacy_models(mdls, &mut taken_ids);
        providers.append(&mut synth_p);
        models.append(&mut synth_m);
    }

    ProviderListModel { providers, models }
}

/// Save (merge) a provider into `[model_providers.<id>]`. Preserves unknown keys.
#[tauri::command]
pub fn providers_save_provider(
    _state: State<'_, crate::commands::AppState>,
    provider: ModelProviderEntry,
) -> Result<(), String> {
    if provider.id.trim().is_empty() {
        return Err("provider id 不能为空".into());
    }
    let mut config = read_config();
    let mps = ensure_table(&mut config, "model_providers")?;
    let existing = mps.get(&provider.id);
    let rendered = provider_to_table(&provider, existing)?;
    mps.insert(provider.id.clone(), rendered);
    write_config(&config)
}

/// Save a model into `[model.<model_id>]` with a `model_provider` reference.
/// Migrates the entry away from legacy per-model connection fields.
#[tauri::command]
pub fn providers_save_model(
    _state: State<'_, crate::commands::AppState>,
    model: ModelEntry,
) -> Result<(), String> {
    if model.model_id.trim().is_empty() {
        return Err("model_id 不能为空".into());
    }
    if model.provider_id.trim().is_empty() {
        return Err("provider_id 不能为空".into());
    }
    let mut config = read_config();
    let mdls = ensure_table(&mut config, "model")?;
    let existing = mdls.get(&model.model_id);
    let rendered = model_to_table(&model, existing);
    mdls.insert(model.model_id.clone(), rendered);
    write_config(&config)
}

/// Delete a provider AND every model that references it.
#[tauri::command]
pub fn providers_delete_provider(id: String) -> Result<(), String> {
    let mut config = read_config();

    // Remove the provider table.
    let removed_provider = config
        .as_table_mut()
        .and_then(|t| t.get_mut("model_providers"))
        .and_then(Value::as_table_mut)
        .and_then(|m| m.remove(&id))
        .is_some();

    // Cascade: drop every [model.*] referencing it.
    let mut cascaded = 0usize;
    if let Some(mdls) = config
        .as_table_mut()
        .and_then(|t| t.get_mut("model"))
        .and_then(Value::as_table_mut)
    {
        let stale: Vec<String> = mdls
            .iter()
            .filter_map(|(mid, v)| {
                let refs = v
                    .as_table()
                    .and_then(|t| t.get("model_provider"))
                    .and_then(Value::as_str);
                if refs == Some(id.as_str()) {
                    Some(mid.clone())
                } else {
                    None
                }
            })
            .collect();
        for mid in stale {
            mdls.remove(&mid);
            cascaded += 1;
        }
    }

    if removed_provider || cascaded > 0 {
        write_config(&config)?;
    }
    Ok(())
}

/// Delete a single model entry.
#[tauri::command]
pub fn providers_delete_model(model_id: String) -> Result<(), String> {
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

// ---------------------------------------------------------------------------
// Back-compat shims (deprecated). Keep the old command names registered so a
// stale frontend build doesn't hit "unknown command" at runtime; they no-op.
// ---------------------------------------------------------------------------

/// Deprecated: use `providers_save_provider` / `providers_save_model`.
#[tauri::command]
pub fn providers_save(
    _state: State<'_, crate::commands::AppState>,
    _providers: Vec<serde_json::Value>,
) -> Result<(), String> {
    Err("providers_save is deprecated; use providers_save_provider / providers_save_model".into())
}

/// Deprecated: use `providers_delete_model`.
#[tauri::command]
pub fn providers_delete(_model_id: String) -> Result<(), String> {
    Err("providers_delete is deprecated; use providers_delete_model".into())
}

// ---------------------------------------------------------------------------
// Remote model discovery.
// ---------------------------------------------------------------------------

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
    match preset(kind).and_then(|p| p.base_url) {
        Some(b) => Ok(b.trim_end_matches('/').to_string()),
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

// ---------------------------------------------------------------------------
// Unit tests.
// ---------------------------------------------------------------------------

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
    fn infer_custom_for_unknown() {
        let mut table = Map::new();
        table.insert("api_backend".into(), Value::String("chat_completions".into()));
        table.insert("base_url".into(), Value::String("https://my-custom.api/v1".into()));
        assert_eq!(infer_provider_kind(&table), "custom");
    }

    // --- allocate_provider_id ---

    #[test]
    fn allocate_id_first_use() {
        let mut taken = std::collections::HashSet::new();
        assert_eq!(allocate_provider_id("openai", &mut taken), "openai");
        assert!(taken.contains("openai"));
    }

    #[test]
    fn allocate_id_dedup_suffix() {
        let mut taken = std::collections::HashSet::new();
        taken.insert("custom".into());
        assert_eq!(allocate_provider_id("custom", &mut taken), "custom-2");
        assert_eq!(allocate_provider_id("custom", &mut taken), "custom-3");
    }

    // --- provider_to_table (new shape) ---

    #[test]
    fn provider_to_table_anthropic_preset() {
        let p = ModelProviderEntry {
            id: "anthropic".into(),
            provider_kind: "anthropic".into(),
            label: None,
            api_key: Some("sk-ant-test".into()),
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            context_window: Some(200_000),
        };
        let result = provider_to_table(&p, None).unwrap();
        let table = result.as_table().unwrap();
        assert_eq!(table["base_url"].as_str().unwrap(), "https://api.anthropic.com/v1");
        assert_eq!(table["api_backend"].as_str().unwrap(), "messages");
        assert_eq!(table["auth_scheme"].as_str().unwrap(), "x_api_key");
        assert_eq!(table["api_key"].as_str().unwrap(), "sk-ant-test");
        assert_eq!(table["context_window"].as_integer().unwrap(), 200_000);
    }

    #[test]
    fn provider_to_table_masked_key_is_noop() {
        let mut existing = Map::new();
        existing.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        existing.insert("api_backend".into(), Value::String("chat_completions".into()));
        existing.insert("auth_scheme".into(), Value::String("bearer".into()));
        existing.insert("api_key".into(), Value::String("real-key".into()));

        let p = ModelProviderEntry {
            id: "openai".into(),
            provider_kind: "openai".into(),
            label: None,
            api_key: Some("••••".into()),
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            context_window: None,
        };
        let table = provider_to_table(&p, Some(&Value::Table(existing))).unwrap();
        assert_eq!(table.as_table().unwrap()["api_key"].as_str().unwrap(), "real-key");
    }

    #[test]
    fn provider_to_table_custom_missing_field_errors() {
        let p = ModelProviderEntry {
            id: "custom".into(),
            provider_kind: "custom".into(),
            label: None,
            api_key: None,
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            context_window: None,
        };
        assert!(provider_to_table(&p, None).is_err());
    }

    // --- model_to_table (migration strips legacy connection fields) ---

    #[test]
    fn model_to_table_sets_reference_and_strips_legacy_fields() {
        let mut existing = Map::new();
        // Legacy per-model connection fields that must be removed on migration.
        existing.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        existing.insert("api_key".into(), Value::String("sk-old".into()));
        existing.insert("api_backend".into(), Value::String("chat_completions".into()));
        existing.insert("auth_scheme".into(), Value::String("bearer".into()));
        // Unrecognized key preserved.
        existing.insert("temperature".into(), Value::String("0.5".into()));

        let m = ModelEntry {
            model_id: "gpt-4o".into(),
            provider_id: "openai".into(),
            name: Some("GPT-4o".into()),
            context_window: None,
        };
        let table = model_to_table(&m, Some(&Value::Table(existing)))
            .as_table()
            .unwrap()
            .clone();

        assert_eq!(table["model"].as_str().unwrap(), "gpt-4o");
        assert_eq!(table["model_provider"].as_str().unwrap(), "openai");
        assert_eq!(table["name"].as_str().unwrap(), "GPT-4o");
        // Legacy connection fields stripped.
        assert!(!table.contains_key("base_url"));
        assert!(!table.contains_key("api_key"));
        assert!(!table.contains_key("api_backend"));
        assert!(!table.contains_key("auth_scheme"));
        // Unrecognized key preserved.
        assert_eq!(table["temperature"].as_str().unwrap(), "0.5");
    }

    #[test]
    fn model_to_table_per_model_context_window_override() {
        let m = ModelEntry {
            model_id: "gpt-4o".into(),
            provider_id: "openai".into(),
            name: None,
            context_window: Some(128_000),
        };
        let table = model_to_table(&m, None).as_table().unwrap().clone();
        assert_eq!(table["context_window"].as_integer().unwrap(), 128_000);
    }

    // --- group_legacy_models (lazy migration, display only) ---

    #[test]
    fn group_legacy_merges_same_endpoint_into_one_provider() {
        let mut models = Map::new();
        for (mid, key) in [
            ("gpt-4o", "sk-aaa"),
            ("gpt-4o-mini", "sk-aaa"),
            ("claude-sonnet-4-5", "sk-ant-bbb"),
        ] {
            let mut entry = Map::new();
            let is_anthropic = mid.starts_with("claude");
            entry.insert(
                "base_url".into(),
                Value::String(
                    if is_anthropic {
                        "https://api.anthropic.com/v1"
                    } else {
                        "https://api.openai.com/v1"
                    }
                    .into(),
                ),
            );
            entry.insert(
                "api_backend".into(),
                Value::String(if is_anthropic { "messages" } else { "chat_completions" }.into()),
            );
            entry.insert("api_key".into(), Value::String(key.into()));
            models.insert(mid.into(), Value::Table(entry));
        }

        let mut taken = std::collections::HashSet::new();
        let (providers, out_models) = group_legacy_models(&models, &mut taken);

        // Two provider groups (openai + anthropic), three models total.
        assert_eq!(providers.len(), 2);
        assert_eq!(out_models.len(), 3);
        // Each model references one of the synthetic providers.
        let pids: Vec<String> = providers.iter().map(|p| p.id.clone()).collect();
        assert!(pids.contains(&"openai".to_string()));
        assert!(pids.contains(&"anthropic".to_string()));
        // Models grouped under the matching provider.
        for m in &out_models {
            if m.model_id.starts_with("gpt") {
                assert_eq!(m.provider_id, "openai");
            } else {
                assert_eq!(m.provider_id, "anthropic");
            }
        }
        // Disk-like input map is unchanged (display-only grouping).
        assert_eq!(models.len(), 3);
        assert!(models["gpt-4o"].as_table().unwrap().contains_key("api_key"));
    }

    #[test]
    fn group_legacy_skips_migrated_entries() {
        let mut models = Map::new();
        let mut migrated = Map::new();
        migrated.insert("model_provider".into(), Value::String("openai".into()));
        models.insert("gpt-4o".into(), Value::Table(migrated));

        let mut taken = std::collections::HashSet::new();
        let (providers, out_models) = group_legacy_models(&models, &mut taken);
        assert!(providers.is_empty());
        assert!(out_models.is_empty());
    }

    #[test]
    fn group_legacy_dedups_custom_ids() {
        let mut models = Map::new();
        for (mid, url) in [
            ("m1", "https://endpoint-a/v1"),
            ("m2", "https://endpoint-b/v1"),
        ] {
            let mut entry = Map::new();
            entry.insert("base_url".into(), Value::String(url.into()));
            entry.insert("api_backend".into(), Value::String("chat_completions".into()));
            entry.insert("api_key".into(), Value::String("k".into()));
            models.insert(mid.into(), Value::Table(entry));
        }
        let mut taken = std::collections::HashSet::new();
        let (providers, _) = group_legacy_models(&models, &mut taken);
        let ids: Vec<String> = providers.iter().map(|p| p.id.clone()).collect();
        assert!(ids.contains(&"custom".to_string()));
        assert!(ids.contains(&"custom-2".to_string()));
    }

    // --- providers_list round-trip over a synthetic config ---

    #[test]
    fn providers_list_reads_new_format_and_legacy() {
        let mut config = Map::new();

        // New-format provider + referencing model.
        let mut mp = Map::new();
        mp.insert("base_url".into(), Value::String("https://api.openai.com/v1".into()));
        mp.insert("api_backend".into(), Value::String("chat_completions".into()));
        mp.insert("auth_scheme".into(), Value::String("bearer".into()));
        mp.insert("api_key".into(), Value::String("sk-xxx".into()));
        mp.insert("context_window".into(), Value::Integer(128_000));
        let mut mps = Map::new();
        mps.insert("openai".into(), Value::Table(mp));
        config.insert("model_providers".into(), Value::Table(mps));

        let mut model = Map::new();
        model.insert("model".into(), Value::String("gpt-4o".into()));
        model.insert("model_provider".into(), Value::String("openai".into()));
        model.insert("name".into(), Value::String("GPT-4o".into()));
        let mut mdls = Map::new();
        mdls.insert("gpt-4o".into(), Value::Table(model));

        // Legacy per-model entry (no model_provider).
        let mut legacy = Map::new();
        legacy.insert("base_url".into(), Value::String("https://api.anthropic.com/v1".into()));
        legacy.insert("api_backend".into(), Value::String("messages".into()));
        legacy.insert("api_key".into(), Value::String("sk-ant".into()));
        mdls.insert("claude-sonnet-4-5".into(), Value::Table(legacy));

        config.insert("model".into(), Value::Table(mdls));

        let v = Value::Table(config);
        // Reconstruct a ProviderListModel the same way providers_list does.
        let mut providers = Vec::new();
        let mut models = Vec::new();
        let mut taken = std::collections::HashSet::new();
        let root = v.as_table().unwrap();
        if let Some(mps) = root.get("model_providers").and_then(Value::as_table) {
            for (id, t) in mps {
                if let Some(tbl) = t.as_table() {
                    taken.insert(id.clone());
                    providers.push(provider_from_table(id, tbl));
                }
            }
        }
        if let Some(mdls) = root.get("model").and_then(Value::as_table) {
            for (mid, t) in mdls {
                let Some(tbl) = t.as_table() else { continue };
                if let Some(pid) = tbl.get("model_provider").and_then(Value::as_str) {
                    models.push(ModelEntry {
                        model_id: mid.clone(),
                        provider_id: pid.to_string(),
                        name: tbl.get("name").and_then(Value::as_str).map(String::from),
                        context_window: tbl.get("context_window").and_then(Value::as_integer).map(|n| n as u64),
                    });
                }
            }
            let (mut sp, mut sm) = group_legacy_models(mdls, &mut taken);
            providers.append(&mut sp);
            models.append(&mut sm);
        }

        // One real provider (openai, with context_window) + one legacy group (anthropic).
        assert_eq!(providers.len(), 2);
        let openai = providers.iter().find(|p| p.id == "openai").unwrap();
        assert_eq!(openai.context_window, Some(128_000));
        assert_eq!(openai.api_key.as_deref(), Some("••••"));
        // gpt-4o references openai; claude-sonnet-4-5 references the legacy group.
        assert_eq!(models.len(), 2);
        let gpt = models.iter().find(|m| m.model_id == "gpt-4o").unwrap();
        assert_eq!(gpt.provider_id, "openai");
        assert_eq!(gpt.name.as_deref(), Some("GPT-4o"));
        let claude = models.iter().find(|m| m.model_id == "claude-sonnet-4-5").unwrap();
        assert_eq!(claude.provider_id, "anthropic");
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
    fn resolve_field_preset_fallback() {
        let result = resolve_field(&None, None, Some("https://preset.api"), "base_url", false);
        assert_eq!(result.unwrap(), "https://preset.api");
    }

    #[test]
    fn resolve_field_custom_missing_errors() {
        let result = resolve_field(&None, None, None, "base_url", true);
        assert!(result.is_err());
    }

    // --- validate helpers ---

    #[test]
    fn validate_backend_and_scheme() {
        assert!(validate_api_backend("chat_completions").is_ok());
        assert!(validate_api_backend("graphql").is_err());
        assert!(validate_auth_scheme("bearer").is_ok());
        assert!(validate_auth_scheme("basic").is_err());
    }

    #[test]
    fn preset_known_kinds() {
        assert!(preset("anthropic").is_some());
        assert!(preset("custom").is_none());
    }

    #[test]
    fn preset_custom_anthropic_has_protocol_but_no_base_url() {
        // custom_anthropic locks protocol/auth to the Anthropic wire shape but
        // has no base_url preset (user must supply the endpoint).
        let p = preset("custom_anthropic").expect("custom_anthropic has a preset");
        assert_eq!(p.base_url, None);
        assert_eq!(p.api_backend, "messages");
        assert_eq!(p.auth_scheme, "x_api_key");
    }

    #[test]
    fn provider_to_table_custom_anthropic_requires_base_url() {
        // No base_url supplied and none in the preset → hard error.
        let p = ModelProviderEntry {
            id: "custom_anthropic".into(),
            provider_kind: "custom_anthropic".into(),
            label: None,
            api_key: Some("sk-ant-test".into()),
            base_url: None,
            api_backend: None,
            auth_scheme: None,
            context_window: None,
        };
        assert!(provider_to_table(&p, None).is_err());
    }

    #[test]
    fn provider_to_table_custom_anthropic_with_base_url_uses_anthropic_protocol() {
        let p = ModelProviderEntry {
            id: "custom_anthropic".into(),
            provider_kind: "custom_anthropic".into(),
            label: None,
            api_key: Some("sk-ant-test".into()),
            base_url: Some("https://my-anthropic-proxy/v1".into()),
            api_backend: None, // should fall back to preset "messages"
            auth_scheme: None, // should fall back to preset "x_api_key"
            context_window: None,
        };
        let table = provider_to_table(&p, None).unwrap();
        let t = table.as_table().unwrap();
        assert_eq!(t["base_url"].as_str().unwrap(), "https://my-anthropic-proxy/v1");
        assert_eq!(t["api_backend"].as_str().unwrap(), "messages");
        assert_eq!(t["auth_scheme"].as_str().unwrap(), "x_api_key");
        assert_eq!(t["api_key"].as_str().unwrap(), "sk-ant-test");
    }
}
