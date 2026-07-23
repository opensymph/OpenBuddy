//! Expert marketplace data — read LIVE from a local WorkBuddy data directory
//! (default `E:\Grok\agents`, overridable from the UI).
//!
//! Layout we consume:
//!   <root>/_meta/_expert_center.json      — categories + experts (rich fields)
//!   <root>/<plugin>/.aily-plugin/plugin.json   (or `.codebuddy-plugin/`)
//!        — the *local* avatar path (`avatars/expert.png` / `avatars/team.png`)
//!
//! The manifest carries everything the cards need (author, `operationalTag` =
//! 特邀专家 ribbon, `isOPC`, `displayPosition`, tags, localized names, the flat
//! COS avatar URL). The plugin.json gives us the on-disk avatar so we can show
//! the real image offline via `experts_thumbnail` (no network / asset-protocol
//! dependency). Avatars total ~100 MB at full res, so we never inline them — the
//! frontend asks for a small cached JPEG per visible card instead.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// COS base used to rebuild the manifest's flat avatar paths as a *fallback* URL
/// (only used when the local file is somehow missing).
const AVATAR_COS_BASE: &str =
    "https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace";

// ---------- output types ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpertCategory {
    pub id: String,
    pub zh: String,
    pub en: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertItem {
    pub id: String,
    pub cat: String,
    pub name: String,
    pub name_en: String,
    pub title: String,
    pub title_en: String,
    pub desc: String,
    pub tags: Vec<String>,
    /// "agent" | "team".
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    /// operationalTag text (e.g. 特邀专家); None when absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ribbon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub init: Option<String>,
    #[serde(default)]
    pub opc: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    /// Absolute local avatar path (feed to `experts_thumbnail`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_local: Option<String>,
    /// COS fallback URL (used if the local file is missing).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// Plugin directory name (e.g. "accessibility-auditor") — used to locate
    /// the agent prompt file at `<root>/<plugin>/agents/<agent_name>.md`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin: Option<String>,
    /// Agent markdown filename stem (e.g. "accessibility-auditor") — the lead
    /// agent for team experts, or the sole agent for single-agent experts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    /// Quick prompts ("试试这样问我") from the manifest.
    #[serde(default)]
    pub quick_prompts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturedSceneOut {
    pub id: String,
    pub zh: String,
    pub expert_ids: Vec<String>,
    /// Absolute local banner path (feed to `experts_image_bytes`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_local: Option<String>,
    /// COS fallback URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertCatalog {
    pub root: String,
    pub categories: Vec<ExpertCategory>,
    pub experts: Vec<ExpertItem>,
    /// 精选场景 from `<root>/_meta/featuredScenes.json` (empty if absent — the
    /// frontend then uses its gradient fallback).
    pub featured_scenes: Vec<FeaturedSceneOut>,
}

// ---------- helpers ----------

/// First non-empty of `value.zh`, `value.en`, or the string itself.
fn loc(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Object(m) => m
            .get("zh")
            .and_then(|v| v.as_str())
            .or_else(|| m.get("en").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn loc_trimmed(value: &Value) -> Option<String> {
    let s = loc(value).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

fn read_plugin_json(root: &Path, plugin: &str) -> Option<Value> {
    for sub in [".aily-plugin", ".codebuddy-plugin"] {
        let p = root.join(plugin).join(sub).join("plugin.json");
        if let Ok(bytes) = std::fs::read(&p) {
            if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
                return Some(v);
            }
        }
    }
    None
}

fn resolve_cos_avatar(avatar: &str) -> Option<String> {
    let t = avatar.trim();
    if t.is_empty() {
        return None;
    }
    if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("data:") {
        return Some(t.to_string());
    }
    let trimmed = t.trim_start_matches('/');
    Some(format!("{AVATAR_COS_BASE}/{trimmed}"))
}

// ---------- root discovery ----------

/// Candidate roots probed when the user hasn't picked one. The first whose
/// `_meta/_expert_center.json` exists wins. `OPENBUDDY_AGENTS_DIR` overrides all.
fn candidate_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(v) = std::env::var("OPENBUDDY_AGENTS_DIR") {
        if !v.is_empty() {
            out.push(PathBuf::from(v));
        }
    }
    out.push(PathBuf::from("E:/Grok/agents"));
    if let Some(h) = dirs::home_dir() {
        out.push(h.join("Grok").join("agents"));
        out.push(h.join("agents"));
    }
    out
}

fn root_has_manifest(root: &Path) -> bool {
    root.join("_meta").join("_expert_center.json").is_file()
}

/// Return the default data root (first existing candidate), or "" if none.
#[tauri::command]
pub async fn experts_default_root() -> Result<String, String> {
    for r in candidate_roots() {
        if root_has_manifest(&r) {
            return Ok(r.to_string_lossy().into_owned());
        }
    }
    Ok(String::new())
}

/// Directories under `root` that look like an expert data root (have the
/// manifest). Used by the UI's "选择来源目录" picker to validate a selection.
#[tauri::command]
pub async fn experts_list_roots(root: String) -> Result<Vec<String>, String> {
    let base = PathBuf::from(&root);
    let mut hits = Vec::new();
    if root_has_manifest(&base) {
        hits.push(base.to_string_lossy().into_owned());
    }
    if let Ok(rd) = std::fs::read_dir(&base) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() && root_has_manifest(&p) {
                hits.push(p.to_string_lossy().into_owned());
            }
        }
    }
    Ok(hits)
}

// ---------- load ----------

/// Parse the manifest at `<root>/_meta/_expert_center.json` and merge each
/// expert with its local plugin.json (for the on-disk avatar path).
#[tauri::command]
pub async fn experts_load(root: Option<String>) -> Result<ExpertCatalog, String> {
    let root = match root {
        Some(r) if !r.is_empty() => PathBuf::from(r),
        _ => {
            let mut found = PathBuf::new();
            for r in candidate_roots() {
                if root_has_manifest(&r) {
                    found = r;
                    break;
                }
            }
            if found.as_os_str().is_empty() {
                return Err("未找到专家数据目录（_meta/_expert_center.json）".into());
            }
            found
        }
    };
    let manifest_path = root.join("_meta").join("_expert_center.json");
    let bytes = std::fs::read(&manifest_path)
        .map_err(|e| format!("读取 manifest 失败：{e}"))?;
    let manifest: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("解析 manifest 失败：{e}"))?;

    let categories = manifest
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    let id = c.get("id")?.as_str()?.to_string();
                    let name = c.get("name").cloned().unwrap_or(Value::Null);
                    Some(ExpertCategory {
                        id,
                        zh: loc(&name),
                        en: c
                            .get("name")
                            .and_then(|n| n.get("en"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let experts = manifest
        .get("experts")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| build_expert(&root, e))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let featured_scenes = load_featured_scenes(&root);

    Ok(ExpertCatalog {
        root: root.to_string_lossy().into_owned(),
        categories,
        experts,
        featured_scenes,
    })
}

/// Parse `<root>/_meta/featuredScenes.json` and resolve each banner to a local
/// file when present (we ship them under `_meta/scene-images/`). Missing file or
/// parse error yields an empty list — the frontend falls back to gradients.
fn load_featured_scenes(root: &Path) -> Vec<FeaturedSceneOut> {
    let path = root.join("_meta").join("featuredScenes.json");
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };
    let v: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = match v.get("scenes").and_then(|s| s.as_array()) {
        Some(a) => a,
        None => return Vec::new(),
    };
    arr.iter()
        .filter_map(|s| {
            let id = s.get("id")?.as_str()?.to_string();
            let zh = loc(&s.get("displayName").cloned().unwrap_or(Value::Null));
            let expert_ids = s
                .get("expertIds")
                .and_then(|a| a.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let image = s
                .get("image")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim();
            let image_local = if image.is_empty() {
                None
            } else {
                let rel = image.trim_start_matches('/');
                let cands = [root.join("_meta").join(rel), root.join(rel)];
                cands.into_iter().find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned())
            };
            let image_url = if image.is_empty() {
                None
            } else {
                resolve_cos_avatar(image)
            };
            Some(FeaturedSceneOut {
                id,
                zh,
                expert_ids,
                image_local,
                image_url,
            })
        })
        .collect()
}

fn build_expert(root: &Path, e: &Value) -> Option<ExpertItem> {
    let id = e.get("id")?.as_str()?.to_string();
    let plugin = e.get("plugin").and_then(|v| v.as_str()).unwrap_or("");
    let pj = read_plugin_json(root, plugin);
    let local_avatar = pj.as_ref().and_then(|pj| {
        let rel = pj.get("avatar")?.as_str()?.to_string();
        let abs = root.join(plugin).join(&rel);
        if abs.is_file() {
            Some(abs.to_string_lossy().into_owned())
        } else {
            None
        }
    });
    // Resolve the lead agent name from plugin.json (agentName field).
    let agent_name = pj
        .as_ref()
        .and_then(|pj| pj.get("agentName").and_then(|v| v.as_str()))
        .map(|s| s.to_string());
    let avatar_url = e
        .get("avatar")
        .and_then(|v| v.as_str())
        .and_then(resolve_cos_avatar);
    let kind = if e.get("expertType").and_then(|v| v.as_str()) == Some("team") {
        "team".to_string()
    } else {
        "agent".to_string()
    };
    let tags = e
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(loc).filter(|s| !s.is_empty()).take(3).collect())
        .unwrap_or_default();
    let desc = {
        let dd = e.get("displayDescription").cloned().unwrap_or(Value::Null);
        let d = loc(&dd);
        if d.is_empty() {
            loc(&e.get("description").cloned().unwrap_or(Value::Null))
        } else {
            d
        }
    };
    Some(ExpertItem {
        id,
        cat: e
            .get("categoryId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: loc(&e.get("displayName").cloned().unwrap_or(Value::Null)),
        name_en: e
            .get("displayName")
            .and_then(|n| n.get("en"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: loc(&e.get("profession").cloned().unwrap_or(Value::Null)),
        title_en: e
            .get("profession")
            .and_then(|n| n.get("en"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        desc,
        tags,
        kind,
        author: loc_trimmed(&e.get("author").cloned().unwrap_or(Value::Null)),
        ribbon: loc_trimmed(&e.get("operationalTag").cloned().unwrap_or(Value::Null)),
        init: loc_trimmed(&e.get("defaultInitPrompt").cloned().unwrap_or(Value::Null)),
        opc: e.get("isOPC").and_then(|v| v.as_bool()).unwrap_or(false),
        pos: e
            .get("displayPosition")
            .and_then(|v| v.as_i64()),
        updated: e
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        avatar_local: local_avatar,
        avatar_url,
        plugin: if plugin.is_empty() { None } else { Some(plugin.to_string()) },
        agent_name,
        quick_prompts: e
            .get("quickPrompts")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().map(loc).filter(|s| !s.is_empty()).take(5).collect())
            .unwrap_or_default(),
    })
}

// ---------- thumbnails ----------

/// Long edge (px) of generated thumbnails — cards render at ≤44px, scenes ≤24px,
/// so 96px covers retina without bloating the cache.
const THUMB_SIZE: u32 = 96;
const THUMB_QUALITY: u8 = 82;

fn thumb_cache_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
        .join("expert-thumbs")
}

/// A stable cache filename derived from the source path + mtime (so editing the
/// source regenerates the thumb).
fn thumb_path_for(src: &Path) -> PathBuf {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    src.to_string_lossy().as_ref().hash(&mut h);
    let mtime = std::fs::metadata(src)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    mtime.hash(&mut h);
    let name = format!("{:016x}.jpg", h.finish());
    thumb_cache_dir().join(name)
}

async fn make_thumbnail(src: &Path) -> Result<String, String> {
    let cache = thumb_path_for(src);
    if cache.is_file() {
        let b = std::fs::read(&cache).map_err(|e| format!("读缓存失败：{e}"))?;
        return Ok(b64(&b));
    }
    // Decode + resize off the async runtime (image work is CPU-bound).
    let src_owned = src.to_path_buf();
    let jpeg = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        use image::imageops::FilterType;
        let img = image::open(&src_owned).map_err(|e| format!("解码图片失败：{e}"))?;
        let thumb = img.resize(THUMB_SIZE, THUMB_SIZE, FilterType::Triangle);
        let rgb = thumb.into_rgb8();
        let (w, h) = (rgb.width(), rgb.height());
        let mut buf = Vec::with_capacity(8 * 1024);
        let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, THUMB_QUALITY);
        enc.encode(rgb.as_raw(), w, h, image::ColorType::Rgb8.into())
            .map_err(|e| format!("编码 JPEG 失败：{e}"))?;
        Ok(buf)
    })
    .await
    .map_err(|e| format!("缩略图任务失败：{e}"))??;

    if let Some(parent) = cache.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Cache write is best-effort; a failure still returns the image.
    let _ = std::fs::write(&cache, &jpeg);
    Ok(b64(&jpeg))
}

fn b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Return a small base64-encoded JPEG thumbnail for a local avatar path. The
/// frontend wraps this in a `data:` URL and caches it; only visible cards call
/// this, so the ~100 MB of full-res avatars is never loaded wholesale.
#[tauri::command]
pub async fn experts_thumbnail(path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Err("头像文件不存在".into());
    }
    make_thumbnail(&src).await
}

/// Read a local image file (e.g. a 精选场景 banner) and return its bytes as
/// base64, so the frontend can show it via a `data:` URL without depending on
/// the asset protocol. Banners are ~100 KB each and few, so no resizing.
#[tauri::command]
pub async fn experts_image_bytes(path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Err("图片文件不存在".into());
    }
    let bytes = std::fs::read(&src).map_err(|e| format!("读取图片失败：{e}"))?;
    // Cap to keep IPC sane; banners are well under this.
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("图片过大".into());
    }
    let mime = match src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{mime};base64,{}", b64(&bytes)))
}

// ---------- agent prompt reading ----------

/// Read the full agent prompt markdown from an expert's package directory.
///
/// Resolves `<root>/<plugin>/agents/<agent_name>.md`. If the exact file is
/// missing, falls back to scanning `agents/` for a single `.md` file (common
/// for single-agent experts where the filename might differ slightly).
///
/// Returns the full file content (frontmatter + body). The frontend strips the
/// frontmatter before injecting into the conversation.
#[tauri::command]
pub async fn experts_read_agent_prompt(
    root: String,
    plugin: String,
    agent_name: String,
) -> Result<String, String> {
    let root = PathBuf::from(&root);
    let agents_dir = root.join(&plugin).join("agents");

    // Primary: exact match.
    let primary = agents_dir.join(format!("{agent_name}.md"));
    if primary.is_file() {
        return std::fs::read_to_string(&primary)
            .map_err(|e| format!("读取 agent prompt 失败：{e}"));
    }

    // Fallback: scan agents/ for any .md file (pick the first one).
    if let Ok(entries) = std::fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                return std::fs::read_to_string(&path)
                    .map_err(|e| format!("读取 agent prompt 失败：{e}"));
            }
        }
    }

    Err(format!(
        "未找到 agent prompt 文件：{}/agents/{agent_name}.md",
        plugin
    ))
}

// ---------- team agent linking ----------

/// Copy a team expert's `agents/*.md` files into `~/.grok/agents/` so that
/// grok's sub-agent discovery can find them by bare name when the lead agent
/// calls the Task tool. Returns the number of files linked.
///
/// This is needed because grok only scans `~/.grok/agents/` and
/// `<cwd>/.grok/agents/` — it doesn't know about the WorkBuddy expert root.
/// By copying the member definitions, the lead agent's orchestration
/// instructions (e.g. "spawn macro-strategist") resolve correctly.
#[tauri::command]
pub async fn experts_link_agents(
    root: String,
    plugin: String,
) -> Result<u32, String> {
    let root = PathBuf::from(&root);
    let agents_dir = root.join(&plugin).join("agents");
    if !agents_dir.is_dir() {
        return Err(format!("agents 目录不存在：{}/agents", plugin));
    }

    // Target: ~/.grok/agents/
    let target_dir = crate::agents_store::user_agents_dir_pub();
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建 agents 目录失败：{e}"))?;

    let mut count = 0u32;
    let entries = std::fs::read_dir(&agents_dir)
        .map_err(|e| format!("读取 agents 目录失败：{e}"))?;
    for entry in entries.flatten() {
        let src = entry.path();
        if !src.is_file() {
            continue;
        }
        let ext = src.extension().and_then(|e| e.to_str());
        if ext != Some("md") {
            continue;
        }
        let filename = src.file_name().unwrap().to_owned();
        let dst = target_dir.join(&filename);
        // Only copy if missing or source is newer (avoid redundant writes).
        let should_copy = if dst.is_file() {
            let src_mtime = std::fs::metadata(&src).and_then(|m| m.modified()).ok();
            let dst_mtime = std::fs::metadata(&dst).and_then(|m| m.modified()).ok();
            match (src_mtime, dst_mtime) {
                (Some(s), Some(d)) => s > d,
                _ => true,
            }
        } else {
            true
        };
        if should_copy {
            std::fs::copy(&src, &dst)
                .map_err(|e| format!("复制 {} 失败：{e}", filename.to_string_lossy()))?;
        }
        count += 1;
    }
    Ok(count)
}
