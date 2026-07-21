//! Desktop shell / filesystem helpers for markdown interactions:
//! open URL, open path, reveal in folder, path_stat, safe write under workspace.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Resolve `path` against optional `cwd`. Absolute paths are used as-is.
fn resolve_path(path: &str, cwd: Option<&str>) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_absolute() {
        return p;
    }
    match cwd {
        Some(c) if !c.is_empty() => PathBuf::from(c).join(p),
        _ => p,
    }
}

/// Ensure `candidate` is inside `root` after canonicalize (best-effort).
/// Returns the canonical candidate path on success.
fn ensure_under_workspace(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    // Reject `..` components in the relative sense before canonicalize.
    for c in candidate.components() {
        if matches!(c, Component::ParentDir) {
            // Still allow if after normalize it stays under root — canonicalize handles this.
        }
    }

    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("无法解析工作区路径：{e}"))?;

    // If parent doesn't exist yet (new file), canonicalize parent + keep filename.
    let candidate_canon = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("无法解析目标路径：{e}"))?
    } else {
        let parent = candidate
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
        }
        let parent_canon = parent
            .canonicalize()
            .map_err(|e| format!("无法解析目标目录：{e}"))?;
        let name = candidate
            .file_name()
            .ok_or_else(|| "目标路径缺少文件名".to_string())?;
        parent_canon.join(name)
    };

    if !candidate_canon.starts_with(&root_canon) {
        return Err(format!(
            "拒绝写入工作区之外的路径：{}",
            candidate_canon.display()
        ));
    }
    Ok(candidate_canon)
}

/// Open a URL in the system default browser / handler.
#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL 为空".into());
    }
    // Basic scheme allow-list for safety.
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:"))
    {
        return Err(format!("不支持的 URL 协议：{url}"));
    }
    open::that(url).map_err(|e| format!("打开链接失败：{e}"))
}

/// Open a local file or directory with the OS default app.
#[tauri::command]
pub async fn open_path(path: String, cwd: Option<String>) -> Result<(), String> {
    let resolved = resolve_path(&path, cwd.as_deref());
    if !resolved.exists() {
        return Err(format!("路径不存在：{}", resolved.display()));
    }
    open::that(&resolved).map_err(|e| format!("打开路径失败：{e}"))
}

/// Reveal a path in the system file manager (select file when possible).
#[tauri::command]
pub async fn reveal_in_folder(path: String, cwd: Option<String>) -> Result<(), String> {
    let resolved = resolve_path(&path, cwd.as_deref());
    if !resolved.exists() {
        return Err(format!("路径不存在：{}", resolved.display()));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // explorer /select,"C:\path\to\file"
        let arg = format!("/select,{}", resolved.display());
        std::process::Command::new("explorer")
            .raw_arg(arg)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败：{e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &resolved.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("打开 Finder 失败：{e}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux: open parent directory
        let parent = if resolved.is_dir() {
            resolved.clone()
        } else {
            resolved
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or(resolved.clone())
        };
        open::that(parent).map_err(|e| format!("打开文件管理器失败：{e}"))?;
        return Ok(());
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathStat {
    pub path: String,
    pub exists: bool,
    /// "file" | "directory" | "other" | "missing"
    pub kind: String,
    pub absolute: String,
}

/// Stat a path (relative paths resolve against cwd).
#[tauri::command]
pub async fn path_stat(path: String, cwd: Option<String>) -> Result<PathStat, String> {
    let resolved = resolve_path(&path, cwd.as_deref());
    let absolute = resolved.to_string_lossy().to_string();
    if !resolved.exists() {
        return Ok(PathStat {
            path,
            exists: false,
            kind: "missing".into(),
            absolute,
        });
    }
    let kind = if resolved.is_dir() {
        "directory"
    } else if resolved.is_file() {
        "file"
    } else {
        "other"
    };
    Ok(PathStat {
        path,
        exists: true,
        kind: kind.into(),
        absolute,
    })
}

/// Read a local text file for the in-app preview panel.
/// Caps at `max_bytes` (default 256 KiB) so huge logs don't freeze the UI.
#[tauri::command]
pub async fn read_text_file(
    path: String,
    cwd: Option<String>,
    max_bytes: Option<u64>,
) -> Result<String, String> {
    let resolved = resolve_path(&path, cwd.as_deref());
    if !resolved.exists() {
        return Err(format!("文件不存在：{}", resolved.display()));
    }
    if !resolved.is_file() {
        return Err(format!("不是文件：{}", resolved.display()));
    }
    let limit = max_bytes.unwrap_or(256 * 1024) as usize;
    let data = std::fs::read(&resolved).map_err(|e| format!("读取失败：{e}"))?;
    let truncated = data.len() > limit;
    let slice = if truncated { &data[..limit] } else { &data[..] };
    let mut text = String::from_utf8_lossy(slice).into_owned();
    if truncated {
        text.push_str("\n\n…(已截断，仅预览前部分内容)");
    }
    Ok(text)
}

/// Write text to a file, restricted to `workspace_root` (session cwd).
/// Creates parent directories as needed. Overwrites existing files.
#[tauri::command]
pub async fn write_text_file(
    path: String,
    content: String,
    workspace_root: String,
) -> Result<String, String> {
    if workspace_root.trim().is_empty() {
        return Err("未设置工作区，无法安全写入".into());
    }
    let root = PathBuf::from(&workspace_root);
    if !root.is_absolute() {
        return Err("工作区路径必须是绝对路径".into());
    }
    let resolved = resolve_path(&path, Some(&workspace_root));
    let safe = ensure_under_workspace(&root, &resolved)?;
    if let Some(parent) = safe.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
        }
    }
    std::fs::write(&safe, content.as_bytes()).map_err(|e| format!("写入失败：{e}"))?;
    Ok(safe.to_string_lossy().to_string())
}

/// Browse / open a directory in the file manager (implements frontend's browse_directory).
#[tauri::command]
pub async fn browse_directory(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在：{path}"));
    }
    let target = if p.is_dir() {
        p
    } else {
        p.parent()
            .map(|x| x.to_path_buf())
            .unwrap_or(p)
    };
    open::that(target).map_err(|e| format!("打开目录失败：{e}"))
}
