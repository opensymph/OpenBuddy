//! Skills panel — drives grok's `x.ai/skills/*` extension methods.
//!
//! grok discovers skills by recursively scanning `~/.grok/skills/`,
//! `<cwd>/.grok/skills/`, and a few bundled/plugin dirs (see
//! `xai-grok-tools/src/implementations/skills/discovery.rs`). Each skill is a
//! directory containing a `SKILL.md` with YAML frontmatter. grok exposes the
//! full CRUD surface over ACP — we call those methods here rather than reading
//! the filesystem ourselves, because grok holds the canonical enabled/disabled
//! state in `~/.grok/config.toml` (`[skills] disabled`, `[skills] paths`) and
//! reloads on file changes.

use agent_client_protocol as acp;
use serde::Deserialize;
use serde_json::value::RawValue;
use std::sync::Arc;
use tauri::State;

use crate::commands::AppState;
use crate::ext::{call_ext, call_ext_value, raw_params};

/// One discovered skill. Mirrors the relevant fields of grok's `SkillInfo`
/// (`xai-grok-tools/src/implementations/skills/types.rs:40`). Unknown/missing
/// fields fall back to defaults — the shape is stable across grok versions but
/// we stay defensive.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Where the skill was discovered: "local" | "repo" | "user" | "server"
    /// | "bundled" | "plugin". See `SkillScope`.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub user_invocable: Option<bool>,
    /// Filesystem path to the skill directory (when available).
    #[serde(default)]
    pub path: Option<String>,
}

/// Generic list shape returned by `x.ai/skills/list` and `x.ai/skills/config`:
/// grok returns either a bare array or `{ skills: [...] }`. We accept both.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum SkillsListResponse {
    Array(Vec<SkillInfo>),
    Wrapped { skills: Vec<SkillInfo> },
}

impl SkillsListResponse {
    fn into_skills(self) -> Vec<SkillInfo> {
        match self {
            SkillsListResponse::Array(v) => v,
            SkillsListResponse::Wrapped { skills } => skills,
        }
    }
}

/// List all skills grok has discovered. `cwd` is optional (used by grok to
/// resolve project-scoped skills).
#[tauri::command]
pub async fn skills_list(
    state: State<'_, AppState>,
    cwd: Option<String>,
) -> Result<Vec<SkillInfo>, String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params: Arc<RawValue> = raw_params(&serde_json::json!({ "cwd": cwd }));
    // Prefer `x.ai/skills/config` (richer: includes paths/ignore config), but
    // fall back to `x.ai/skills/list` if the method is unavailable on this
    // grok build.
    let res: Result<SkillsListResponse, _> = call_ext(&tx, "x.ai/skills/config", params.clone()).await;
    let skills = match res {
        Ok(v) => v.into_skills(),
        Err(_) => {
            let v: SkillsListResponse = call_ext(&tx, "x.ai/skills/list", params)
                .await
                .map_err(|e| e.to_string())?;
            v.into_skills()
        }
    };
    Ok(skills)
}

/// Add a skill path (directory or file) to `[skills].paths` and rescan.
#[tauri::command]
pub async fn skills_add(
    state: State<'_, AppState>,
    path: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "path": path, "cwd": cwd }));
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/skills/add", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove a skill path from `[skills].paths`.
#[tauri::command]
pub async fn skills_remove(
    state: State<'_, AppState>,
    path: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let params = raw_params(&serde_json::json!({ "path": path, "cwd": cwd }));
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/skills/remove", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Enable or disable a skill by name (writes `[skills] disabled`).
#[tauri::command]
pub async fn skills_toggle(
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
    let _: acp::ExtResponse = call_ext_value(&tx, "x.ai/skills/toggle", params)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
