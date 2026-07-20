//! Default-permission rules — reads/writes grok's `[permission]` config block.
//!
//! grok evaluates tool-call permission against rules in `~/.grok/config.toml`:
//!
//! ```toml
//! [permission]
//! deny = ["Bash(rm -rf *)"]
//! allow = ["Bash(git *)", "Bash(gh *)"]
//! # OR structured form:
//! rules = [
//!   { action = "allow", tool = "bash", pattern = "git *" },
//!   { action = "deny",  tool = "bash", pattern = "rm -rf *" },
//! ]
//! ```
//!
//! We read BOTH forms and expose a unified `Vec<PermissionRule>`; writes always
//! go to the compact string-array form (`deny = [...]` / `allow = [...]`) so
//! we don't fight grok's own structured editor. Reuses `providers.rs`'s
//! atomic `read_config`/`write_config` pattern. NOTE: changes require a grok
//! restart to take effect (grok loads config once at agent init).

use serde::{Deserialize, Serialize};
use tauri::State;
use toml::map::Map;
use toml::Value;

use crate::commands::AppState;

/// One permission rule. `action` is one of "allow" | "deny" | "ask";
/// `tool` is "bash" | "read" | "edit" | "grep" | "mcp" | "webfetch" | "any";
/// `pattern` is an optional glob (e.g. "git *").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub action: String,
    pub tool: String,
    #[serde(default)]
    pub pattern: Option<String>,
}

/// grok stores compact-form rules as `Tool(pattern)` strings. Parse one into
/// our structured form. Examples: `"Bash(git *)"`, `"Read"`, `"Edit(/tmp/**)"`.
fn parse_compact_rule(s: &str, action: &str) -> PermissionRule {
    let s = s.trim();
    if let Some(open) = s.find('(') {
        let tool = s[..open].trim().to_lowercase();
        // `Bash(git *)` → pattern = "git *". Strip trailing ')'.
        let pattern = s[open + 1..].trim_end_matches(')').trim().to_string();
        PermissionRule {
            action: action.to_string(),
            tool,
            pattern: if pattern.is_empty() { None } else { Some(pattern) },
        }
    } else {
        PermissionRule {
            action: action.to_string(),
            tool: s.to_lowercase(),
            pattern: None,
        }
    }
}

/// Read the `[permission]` block from config.toml. Supports both the compact
/// (`deny = [...]`) and structured (`rules = [{ action, tool, pattern }]`)
/// forms. Returns an empty vec if config is missing or the block is absent.
pub fn read_rules() -> Vec<PermissionRule> {
    let config = crate::providers::read_config();
    let Some(perm) = config.get("permission").and_then(Value::as_table) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    // Compact form: deny/allow/ask are arrays of "Tool(pattern)" strings.
    for action in &["deny", "allow", "ask"] {
        if let Some(arr) = perm.get(*action).and_then(Value::as_array) {
            for v in arr {
                if let Some(s) = v.as_str() {
                    out.push(parse_compact_rule(s, action));
                }
            }
        }
    }
    // Structured form: `rules = [{ action, tool, pattern }]`.
    if let Some(arr) = perm.get("rules").and_then(Value::as_array) {
        for v in arr {
            let Some(table) = v.as_table() else { continue };
            out.push(PermissionRule {
                action: table
                    .get("action")
                    .and_then(Value::as_str)
                    .unwrap_or("allow")
                    .to_string(),
                tool: table
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or("any")
                    .to_string(),
                pattern: table
                    .get("pattern")
                    .and_then(Value::as_str)
                    .map(String::from),
            });
        }
    }
    out
}

/// Render a rule back to grok's compact `Tool(pattern)` form.
fn rule_to_compact(rule: &PermissionRule) -> String {
    let tool = rule.tool.to_lowercase();
    let cap = capitalize_tool(&tool);
    match &rule.pattern {
        Some(p) if !p.is_empty() => format!("{cap}({p})"),
        _ => cap,
    }
}

fn capitalize_tool(tool: &str) -> String {
    let mut c = tool.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// Replace the `[permission]` block's compact-form arrays. We always write the
/// compact form (deny/allow/ask) and drop any structured `rules` array to
/// avoid ambiguity — grok accepts both, but mixing them is confusing.
pub fn write_rules(rules: Vec<PermissionRule>) -> Result<(), String> {
    let mut config = crate::providers::read_config();
    let table = config
        .as_table_mut()
        .ok_or("config root is not a table")?;
    // Reset the [permission] block: drop it entirely so we rewrite from scratch.
    table.remove("permission");
    if rules.is_empty() {
        // No rules → just ensure no stale block remains.
        return crate::providers::write_config(&config);
    }
    let mut perm = Map::new();
    // Group by action.
    let mut deny: Vec<Value> = Vec::new();
    let mut allow: Vec<Value> = Vec::new();
    let mut ask: Vec<Value> = Vec::new();
    for rule in &rules {
        let compact = rule_to_compact(rule);
        let v = Value::String(compact);
        match rule.action.as_str() {
            "deny" => deny.push(v),
            "ask" => ask.push(v),
            _ => allow.push(v),
        }
    }
    if !deny.is_empty() {
        perm.insert("deny".into(), Value::Array(deny));
    }
    if !allow.is_empty() {
        perm.insert("allow".into(), Value::Array(allow));
    }
    if !ask.is_empty() {
        perm.insert("ask".into(), Value::Array(ask));
    }
    table.insert("permission".into(), Value::Table(perm));
    crate::providers::write_config(&config)
}

/// List the current permission rules. Read-only — no agent round-trip needed.
#[tauri::command]
pub fn permission_list(_state: State<'_, AppState>) -> Vec<PermissionRule> {
    read_rules()
}

/// Replace all permission rules with the supplied list. Atomic write to
/// config.toml; requires a grok restart to take effect.
#[tauri::command]
pub fn permission_save(
    _state: State<'_, AppState>,
    rules: Vec<PermissionRule>,
) -> Result<(), String> {
    write_rules(rules)
}

// ========================================================================
// Agent / assistant defaults — `[models] default` + `[ui] default_selected_permission`
// ========================================================================

/// The current "new session" defaults that affect every agent/assistant.
/// Mirrors grok's `[models] default` and `[ui] default_selected_permission`
/// config keys (see user-guide/05-configuration.md).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefaults {
    /// Model id used for new sessions (`[models] default`). Empty = grok
    /// falls back to its built-in default (`grok-build`).
    #[serde(default)]
    pub default_model: String,
    /// Default permission selection on the FIRST approval prompt
    /// (`[ui] default_selected_permission`). One of:
    /// "always_allow_all_sessions" | "always_allow_this_session" |
    /// "allow_once" | "always_deny_all_sessions" | "deny_once".
    /// Empty = grok's built-in default (no preselection).
    #[serde(default)]
    pub default_permission: String,
    /// Whether to show "Always allow" options on permission prompts
    /// (`[ui] remember_tool_approvals`). Null = unset.
    #[serde(default)]
    pub remember_tool_approvals: Option<bool>,
}

impl Default for AgentDefaults {
    fn default() -> Self {
        Self {
            default_model: String::new(),
            default_permission: String::new(),
            remember_tool_approvals: None,
        }
    }
}

/// Read the agent defaults from config.toml.
pub fn read_defaults() -> AgentDefaults {
    let config = crate::providers::read_config();
    let mut out = AgentDefaults::default();
    if let Some(models) = config.get("models").and_then(Value::as_table) {
        if let Some(d) = models.get("default").and_then(Value::as_str) {
            out.default_model = d.to_string();
        }
    }
    if let Some(ui) = config.get("ui").and_then(Value::as_table) {
        if let Some(p) = ui.get("default_selected_permission").and_then(Value::as_str) {
            out.default_permission = p.to_string();
        }
        if let Some(r) = ui.get("remember_tool_approvals").and_then(Value::as_bool) {
            out.remember_tool_approvals = Some(r);
        }
    }
    out
}

/// Write the agent defaults to config.toml. We preserve all other keys in
/// `[models]` and `[ui]` (merge, not replace).
pub fn write_defaults(defaults: &AgentDefaults) -> Result<(), String> {
    let mut config = crate::providers::read_config();
    let root = config
        .as_table_mut()
        .ok_or("config root is not a table")?;

    // [models].default
    if !root.contains_key("models") {
        root.insert("models".into(), Value::Table(Map::new()));
    }
    if let Some(models) = root
        .get_mut("models")
        .and_then(Value::as_table_mut)
    {
        if defaults.default_model.is_empty() {
            models.remove("default");
        } else {
            models.insert("default".into(), Value::String(defaults.default_model.clone()));
        }
    }

    // [ui].default_selected_permission + remember_tool_approvals
    if !root.contains_key("ui") {
        root.insert("ui".into(), Value::Table(Map::new()));
    }
    if let Some(ui) = root.get_mut("ui").and_then(Value::as_table_mut) {
        if defaults.default_permission.is_empty() {
            ui.remove("default_selected_permission");
        } else {
            ui.insert(
                "default_selected_permission".into(),
                Value::String(defaults.default_permission.clone()),
            );
        }
        match defaults.remember_tool_approvals {
            Some(b) => {
                ui.insert("remember_tool_approvals".into(), Value::Boolean(b));
            }
            None => {
                ui.remove("remember_tool_approvals");
            }
        }
    }

    crate::providers::write_config(&config)
}

/// Read the agent defaults (new-session model + default permission).
#[tauri::command]
pub fn agents_defaults_get(_state: State<'_, AppState>) -> AgentDefaults {
    read_defaults()
}

/// Save the agent defaults. Atomic write to config.toml.
#[tauri::command]
pub fn agents_defaults_save(
    _state: State<'_, AppState>,
    defaults: AgentDefaults,
) -> Result<(), String> {
    write_defaults(&defaults)
}
