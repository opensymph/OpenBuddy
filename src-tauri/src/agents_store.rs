//! Experts / Assistants — read & write grok's agent definition files.
//!
//! grok discovers "agents" (subagent definitions — see
//! `xai-grok-agent/src/discovery.rs`) by scanning:
//!   - project: `<cwd>/.grok/agents/*.md` and `<cwd>/.claude/agents/*.md`
//!     (walking up to the git worktree root)
//!   - user: `~/.grok/agents/*.md`
//!
//! Each file is markdown with YAML frontmatter (the `AgentDefinition` fields
//! from `xai-grok-agent/src/config.rs:714`) plus a body used as the system
//! prompt. grok does NOT expose an `x.ai/agents/*` ACP method, so we read and
//! write these files directly — there's no in-memory state to race with
//! (grok's file watcher picks up changes on its own).
//!
//! OpenBuddy cannot switch the active session's agent (ACP has no such call),
//! but the user can launch a new session guided by an agent's prompt, or
//! spawn the agent via grok's `spawn_subagent` tool from within a chat.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// One agent definition, as surfaced to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    /// Agent name (from frontmatter `name`, falling back to the file stem).
    pub name: String,
    /// Short description (frontmatter `description`).
    #[serde(default)]
    pub description: Option<String>,
    /// Where the file lives: "user" (`~/.grok/agents/`) or "project"
    /// (`<cwd>/.grok/agents/`).
    pub scope: String,
    /// Absolute path to the `.md` file.
    pub path: String,
    /// Full file contents (frontmatter + body), for the editor view.
    pub raw: String,
    /// Avatar preset index (1-20). Mirrors WorkBuddy's CreateColleagueDialog
    /// avatar presets. Stored in frontmatter as `avatar: <n>`. 0/None = use
    /// the name-initial fallback.
    #[serde(default)]
    pub avatar: Option<u32>,
    /// Model capability tags: subset of ["default", "multimodal", "reasoning"].
    /// Stored in frontmatter as `model_tags: [a, b]` (comma-separated also ok).
    /// Used by the assistant card to show capability badges.
    #[serde(default)]
    pub model_tags: Vec<String>,
}

/// Parsed YAML frontmatter (only the fields we display). Unknown keys are
/// ignored — `AgentDefinition` has ~30 fields, we only need a few for the UI.
#[derive(Debug, Default, Deserialize)]
struct AgentFrontmatter {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    avatar: Option<u32>,
    #[serde(default)]
    model_tags: Vec<String>,
}

fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

fn user_agents_dir() -> PathBuf {
    grok_home().join("agents")
}

/// Public accessor for the user-scope agents directory (used by experts.rs
/// to link team member agents for grok discovery).
pub fn user_agents_dir_pub() -> PathBuf {
    user_agents_dir()
}

/// Project-level agents dir for a cwd: `<cwd>/.grok/agents/`. (We don't walk
/// up to the git root to keep the scan cheap; users can put agents in
/// `~/.grok/agents/` for cross-project access.)
fn project_agents_dir(cwd: &str) -> PathBuf {
    PathBuf::from(cwd).join(".grok").join("agents")
}

/// Scan one directory for `*.md` agent files. Best-effort: unreadable entries
/// are skipped.
fn scan_dir(dir: &Path, scope: &str) -> Vec<AgentEntry> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_md = path.extension().and_then(|e| e.to_str()) == Some("md");
        if !is_md {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
        let fm = parse_frontmatter(&raw);
        let name = fm
            .name
            .clone()
            .or_else(|| {
                path.file_stem()
                    .and_then(|n| n.to_str())
                    .map(String::from)
            })
            .unwrap_or_else(|| "unnamed".into());
        out.push(AgentEntry {
            name,
            description: fm.description.clone(),
            scope: scope.to_string(),
            path: path.to_string_lossy().into_owned(),
            avatar: fm.avatar,
            model_tags: fm.model_tags.clone(),
            raw,
        });
    }
    out
}

/// Extract the YAML frontmatter block (`---\n...\n---`) and parse the few
/// fields we care about. Returns defaults if the block is absent or malformed
/// — we never fail the whole scan on one bad file.
fn parse_frontmatter(raw: &str) -> AgentFrontmatter {
    let raw = raw.trim_start();
    if !raw.starts_with("---") {
        return AgentFrontmatter::default();
    }
    // Skip the opening `---` line.
    let after_open = match raw.find('\n') {
        Some(i) => &raw[i + 1..],
        None => return AgentFrontmatter::default(),
    };
    // Find the closing `---` on its own line.
    let end = after_open
        .find("\n---")
        .or_else(|| after_open.find("\r\n---"));
    let block = match end {
        Some(i) => &after_open[..i],
        None => return AgentFrontmatter::default(),
    };
    // Minimal YAML parse: only `key: value` lines for the fields we display.
    // We avoid pulling in a YAML crate for this — the agent frontmatter we
    // care about is flat and simple. `model_tags` may appear as
    // `model_tags: [a, b]` (inline array) or `model_tags: a, b` (csv).
    let mut fm = AgentFrontmatter::default();
    for line in block.lines() {
        let Some((k, v)) = line.split_once(':') else { continue };
        let k = k.trim();
        let v = v.trim().trim_matches('"').trim_matches('\'');
        match k {
            "name" if !v.is_empty() => fm.name = Some(v.to_string()),
            "description" if !v.is_empty() => fm.description = Some(v.to_string()),
            "avatar" => {
                if let Ok(n) = v.parse::<u32>() {
                    fm.avatar = Some(n);
                }
            }
            "model_tags" => {
                let list = if v.starts_with('[') && v.ends_with(']') {
                    // Inline YAML array: strip brackets, split on comma.
                    v[1..v.len() - 1]
                        .split(',')
                        .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>()
                } else if v.is_empty() {
                    Vec::new()
                } else {
                    // CSV form.
                    v.split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>()
                };
                fm.model_tags = list;
            }
            _ => {}
        }
    }
    fm
}

/// List all agent definitions visible to OpenBuddy. Combines user-scope and
/// project-scope (for the given cwd). User entries come first, then project.
#[tauri::command]
pub fn agents_list(cwd: Option<String>) -> Vec<AgentEntry> {
    let mut out = scan_dir(&user_agents_dir(), "user");
    if let Some(cwd) = cwd {
        out.extend(scan_dir(&project_agents_dir(&cwd), "project"));
    }
    // De-dup by name (user scope wins, matching grok's scope precedence).
    let mut seen = std::collections::HashSet::new();
    out.retain(|a| seen.insert(a.name.clone()));
    out
}

/// Fetch a single agent file's full contents.
#[tauri::command]
pub fn agents_get(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

/// Save an agent file (create or overwrite). Writes to the user-scope
/// directory (`~/.grok/agents/<name>.md`) so it's available across projects.
/// The caller supplies the full markdown body (frontmatter + prompt).
#[tauri::command]
pub fn agents_save(name: String, raw: String) -> Result<AgentEntry, String> {
    let safe_name = sanitize_name(&name);
    if safe_name.is_empty() {
        return Err("agent name must not be empty".into());
    }
    let dir = user_agents_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create agents dir: {e}"))?;
    let path = dir.join(format!("{safe_name}.md"));
    std::fs::write(&path, &raw).map_err(|e| format!("write agent: {e}"))?;
    let fm = parse_frontmatter(&raw);
    Ok(AgentEntry {
        name: fm.name.unwrap_or(safe_name),
        description: fm.description,
        scope: "user".into(),
        path: path.to_string_lossy().into_owned(),
        avatar: fm.avatar,
        model_tags: fm.model_tags.clone(),
        raw,
    })
}

/// Delete an agent file by path.
#[tauri::command]
pub fn agents_delete(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("delete {path}: {e}"))
}

/// Build a starter agent markdown body from a name/description/system prompt.
/// Exposed as a command so the frontend's "create assistant" form can render a
/// preview before saving. Optional `avatar` (1-20) and `model_tags`
/// (Vec<String>) are written to frontmatter so the UI can render the avatar
/// preset and capability badges.
#[tauri::command]
pub fn agents_template(
    name: String,
    description: String,
    system_prompt: String,
    avatar: Option<u32>,
    model_tags: Option<Vec<String>>,
) -> Result<String, String> {
    let safe = sanitize_name(&name);
    let mut fm = format!("---\nname: {safe}\ndescription: {}\n", description.replace('\n', " "));
    if let Some(a) = avatar {
        fm.push_str(&format!("avatar: {a}\n"));
    }
    if let Some(tags) = model_tags.as_ref().filter(|t| !t.is_empty()) {
        // Inline YAML array form.
        let joined: Vec<String> = tags.iter().map(|t| format!("{t:?}")).collect();
        fm.push_str(&format!("model_tags: [{}]\n", joined.join(", ")));
    }
    fm.push_str("---\n\n");
    fm.push_str(system_prompt.trim());
    fm.push('\n');
    Ok(fm)
}

/// Normalize an agent name for use as a filename. grok's `normalize_skill_name`
/// lowercases and allows `[a-z0-9-]`; we apply the same rule to agent names.
fn sanitize_name(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' => c,
            _ => '-',
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}
