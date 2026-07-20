//! Automations (定时任务) — OpenBuddy-managed local scheduler.
//!
//! grok only exposes `x.ai/scheduler/delete` (deleting tasks it created itself
//! via tool calls). It does NOT let a client create new scheduled tasks.
//! WorkBuddy's automation panel needs create/update/list, so OpenBuddy keeps
//! its own automation table in `~/.grok/openbuddy-automations.json`.
//!
//! Each automation has an RRULE-like schedule + a prompt + optional expert.
//! At fire time, the scheduler opens a fresh grok session in the automation's
//! cwd and sends the prompt. Results land in the sidebar like any chat.
//!
//! The scheduler runs in-process (tokio task), polling every minute. This is
//! intentionally simple — we avoid pulling in a cron library for v1.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;

/// Frequency for an automation. We support the common cases from
/// WorkBuddy's i18n keys (once/daily/weekly/monthly).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Schedule {
    /// Fire once at a fixed ISO timestamp.
    Once { at: String },
    /// Fire every day at HH:MM (local).
    Daily { time: String },
    /// Fire every week on the given weekdays at HH:MM.
    /// `weekdays` = [0..6] where 0 = Sunday.
    Weekly { weekdays: Vec<u8>, time: String },
    /// Fire every month on the given day-of-month at HH:MM.
    Monthly { day: u8, time: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    pub id: String,
    pub name: String,
    /// The prompt to send when this automation fires.
    pub prompt: String,
    /// Optional expert (agent name) to seed the session with.
    #[serde(default)]
    pub expert_id: Option<String>,
    /// Optional model id override.
    #[serde(default)]
    pub model_id: Option<String>,
    /// Working directory the automation runs in.
    #[serde(default)]
    pub cwd: Option<String>,
    pub schedule: Schedule,
    /// "active" | "paused".
    #[serde(default = "default_status")]
    pub status: String,
    /// ISO timestamp of last fire (for "last run" display).
    #[serde(default)]
    pub last_run_at: Option<String>,
    /// ISO timestamp of next fire (precomputed for display).
    #[serde(default)]
    pub next_run_at: Option<String>,
    pub created_at: String,
}

fn default_status() -> String {
    "active".into()
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AutomationStore {
    #[serde(default)]
    pub automations: Vec<Automation>,
}

fn store_path() -> PathBuf {
    grok_home().join("openbuddy-automations.json")
}

fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

/// Read the automation store. Missing/corrupt → empty (never block on this).
fn read_store() -> AutomationStore {
    let Ok(content) = std::fs::read_to_string(store_path()) else {
        return AutomationStore::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Atomic write (mirrors providers::write_config).
fn write_store(store: &AutomationStore) -> Result<(), String> {
    let path = store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    let body =
        serde_json::to_string_pretty(store).map_err(|e| format!("serialize automations: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &body).map_err(|e| format!("write tmp: {e}"))?;
    if std::fs::rename(&tmp, &path).is_err() {
        std::fs::write(&path, &body).map_err(|e| format!("write automations: {e}"))?;
    }
    Ok(())
}

/// Recompute `next_run_at` for all active automations.
fn refresh_next_runs(store: &mut AutomationStore) {
    let now = now_minutes();
    for a in &mut store.automations {
        if a.status != "active" {
            a.next_run_at = None;
            continue;
        }
        a.next_run_at = compute_next_run(&a.schedule, now);
    }
}

fn now_minutes() -> chrono::DateTime<chrono::Local> {
    chrono::Local::now()
}

/// Compute the next fire time for a schedule, after `from`.
/// Returns an ISO 8601 string in local time.
fn compute_next_run(sched: &Schedule, from: chrono::DateTime<chrono::Local>) -> Option<String> {
    use chrono::{Datelike, NaiveTime};
    let parse_time = |s: &str| -> Option<NaiveTime> {
        let mut parts = s.split(':');
        let h: u32 = parts.next()?.parse().ok()?;
        let m: u32 = parts.next()?.parse().ok()?;
        NaiveTime::from_hms_opt(h, m, 0)
    };
    match sched {
        Schedule::Once { at } => {
            // Already-fired once entries stay in the past.
            chrono::DateTime::parse_from_rfc3339(at)
                .ok()
                .map(|dt| dt.to_rfc3339())
        }
        Schedule::Daily { time } => {
            let t = parse_time(time)?;
            let mut next = from.date_naive().and_time(t).and_local_timezone(from.timezone()).single()?;
            if next <= from {
                next = next + chrono::Duration::days(1);
            }
            Some(next.to_rfc3339())
        }
        Schedule::Weekly { weekdays, time } => {
            let t = parse_time(time)?;
            // Search the next 7 days for a matching weekday.
            for i in 0..7 {
                let candidate_date = (from + chrono::Duration::days(i)).date_naive();
                let wd = candidate_date.weekday();
                let wd_num = wd.num_days_from_sunday() as u8;
                if weekdays.iter().any(|w| *w == wd_num) {
                    let candidate = candidate_date
                        .and_time(t)
                        .and_local_timezone(from.timezone())
                        .single()?;
                    if candidate > from {
                        return Some(candidate.to_rfc3339());
                    }
                }
            }
            None
        }
        Schedule::Monthly { day, time } => {
            let t = parse_time(time)?;
            // Search the next ~31 days for the matching day-of-month.
            for i in 0..31 {
                let candidate_date = (from + chrono::Duration::days(i)).date_naive();
                if candidate_date.day() as u8 == *day {
                    let candidate = candidate_date
                        .and_time(t)
                        .and_local_timezone(from.timezone())
                        .single()?;
                    if candidate > from {
                        return Some(candidate.to_rfc3339());
                    }
                }
            }
            None
        }
    }
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn automations_list() -> Vec<Automation> {
    let mut store = read_store();
    refresh_next_runs(&mut store);
    store.automations
}

#[tauri::command]
pub fn automations_save(
    automation: Automation,
) -> Result<Automation, String> {
    let mut store = read_store();
    // Validate.
    if automation.name.trim().is_empty() {
        return Err("name must not be empty".into());
    }
    if automation.prompt.trim().is_empty() {
        return Err("prompt must not be empty".into());
    }
    let id = if automation.id.is_empty() {
        uuid::Uuid::now_v7().to_string()
    } else {
        automation.id.clone()
    };
    let now = now_minutes().to_rfc3339();
    let mut final_automation = automation;
    final_automation.id = id.clone();
    if final_automation.created_at.is_empty() {
        final_automation.created_at = now.clone();
    }
    // Recompute next run for this one.
    let mut tmp_store = AutomationStore {
        automations: vec![final_automation.clone()],
    };
    refresh_next_runs(&mut tmp_store);
    final_automation = tmp_store.automations.remove(0);

    // Upsert.
    if let Some(existing) = store.automations.iter_mut().find(|a| a.id == id) {
        *existing = final_automation.clone();
    } else {
        store.automations.push(final_automation.clone());
    }
    write_store(&store)?;
    Ok(final_automation)
}

#[tauri::command]
pub fn automations_delete(id: String) -> Result<(), String> {
    let mut store = read_store();
    store.automations.retain(|a| a.id != id);
    write_store(&store)
}

#[tauri::command]
pub fn automations_toggle(id: String, active: bool) -> Result<(), String> {
    let mut store = read_store();
    let status = if active { "active" } else { "paused" };
    for a in &mut store.automations {
        if a.id == id {
            a.status = status.into();
        }
    }
    refresh_next_runs(&mut store);
    write_store(&store)
}

/// Manually fire an automation now (test run). Opens a new grok session and
/// sends the prompt — the result appears in the sidebar like any chat.
#[tauri::command]
pub async fn automations_run(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let store = read_store();
    let automation = store
        .automations
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("automation {id} not found"))?;
    let cwd = automation.cwd.unwrap_or_else(|| {
        state
            .cwd
            .lock()
            .unwrap()
            .clone()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    });
    let tx = state
        .tx
        .lock()
        .unwrap()
        .clone()
        .ok_or("agent not initialized")?;
    let session_id = crate::grok::new_session(
        &tx,
        &PathBuf::from(&cwd),
        automation.model_id.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    crate::grok::prompt(&tx, &session_id, &automation.prompt)
        .await
        .map_err(|e| e.to_string())?;
    // Mark last-run.
    let mut store = read_store();
    let now = now_minutes().to_rfc3339();
    for a in &mut store.automations {
        if a.id == id {
            a.last_run_at = Some(now.clone());
        }
    }
    write_store(&store)?;
    let _ = session_id; // (could be returned to surface "open this new chat")
    Ok(())
}

/// Background scheduler tick. Called every minute by a periodic task started
/// in lib.rs. Fires any automation whose `next_run_at` has passed.
pub async fn scheduler_tick(tx: &xai_acp_lib::AcpAgentTx, default_cwd: &PathBuf) {
    let mut store = read_store();
    refresh_next_runs(&mut store);
    let now = now_minutes();
    let due: Vec<Automation> = store
        .automations
        .iter()
        .filter(|a| a.status == "active")
        .filter(|a| {
            a.next_run_at
                .as_ref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|t| t.with_timezone(&now.timezone()) <= now)
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    if due.is_empty() {
        // Persist next-run recomputes occasionally (cheap).
        let _ = write_store(&store);
        return;
    }
    for automation in &due {
        let cwd = automation
            .cwd
            .clone()
            .map(PathBuf::from)
            .unwrap_or_else(|| default_cwd.clone());
        match crate::grok::new_session(tx, &cwd, automation.model_id.as_deref()).await {
            Ok(session_id) => {
                if let Err(e) = crate::grok::prompt(tx, &session_id, &automation.prompt).await {
                    tracing::warn!(error = ?e, id = %automation.id, "automation prompt failed");
                }
            }
            Err(e) => {
                tracing::warn!(error = ?e, id = %automation.id, "automation new_session failed");
            }
        }
        for a in &mut store.automations {
            if a.id == automation.id {
                a.last_run_at = Some(now.to_rfc3339());
            }
        }
    }
    refresh_next_runs(&mut store);
    let _ = write_store(&store);
}

/// Hold a global OnceLock so the scheduler doesn't start twice.
static SCHEDULER_STARTED: OnceLock<()> = OnceLock::new();

/// Start the background scheduler (idempotent — safe to call multiple times).
pub fn start_scheduler(tx: xai_acp_lib::AcpAgentTx, default_cwd: PathBuf) {
    if SCHEDULER_STARTED.set(()).is_err() {
        return; // Already started.
    }
    tokio::spawn(async move {
        // Tick every 60s. The first tick is immediate so newly-due tasks fire
        // quickly after app start.
        loop {
            scheduler_tick(&tx, &default_cwd).await;
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

// silence unused import warnings
#[allow(dead_code)]
fn _unused(_: HashMap<String, String>) {}

