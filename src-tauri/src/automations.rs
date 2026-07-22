//! Automations (定时任务) — OpenBuddy-managed local scheduler.
//!
//! grok only exposes `x.ai/scheduler/delete` (deleting tasks it created itself
//! via tool calls). It does NOT let a client create new scheduled tasks.
//! WorkBuddy's automation panel needs create/update/list, so OpenBuddy keeps
//! its own automation table in `~/.grok/openbuddy-automations.json` and a run
//! record table in `~/.grok/openbuddy-automation-records.json`.
//!
//! Data model mirrors WorkBuddy's automation panel 1:1:
//!  - scheduleType: "recurring" | "once"
//!  - recurring schedule: freq DAILY/WEEKLY/MONTHLY/YEARLY/HOURLY + interval
//!    (双周 = WEEKLY interval 2; 按间隔 = HOURLY + intervalHours) + byday /
//!    bymonthday / bymonth + byhour:byminute
//!  - once: scheduledDate (YYYY-MM-DD) + scheduledTime (HH:MM)
//!  - validity window: validFromDate / validUntilDate (recurring only)
//!  - extras: skills, expert, connectorIds, permissionMode, pushToWeChat
//!
//! At fire time the scheduler opens a fresh grok session in the automation's
//! cwd and sends the prompt; a run record (running → success/failed) is
//! written so the 运行记录 tab can render history.
//!
//! The scheduler runs in-process (tokio task), polling every minute.

use std::path::PathBuf;
use std::sync::OnceLock;

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveTime, Weekday};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppState;

// ---------- models ----------

/// RRULE-like frequency. Serialized as "DAILY" | "WEEKLY" | "MONTHLY" |
/// "YEARLY" | "HOURLY" to match the frontend model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScheduleFreq {
    DAILY,
    WEEKLY,
    MONTHLY,
    YEARLY,
    HOURLY,
}

fn default_interval() -> u32 {
    1
}
fn default_hour() -> u32 {
    9
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSchedule {
    pub freq: ScheduleFreq,
    /// 1 = every week, 2 = bi-weekly (WEEKLY only).
    #[serde(default = "default_interval")]
    pub interval: u32,
    /// Weekday codes "MO".."SU".
    #[serde(default)]
    pub byday: Vec<String>,
    /// Days of month 1..=31 (MONTHLY/YEARLY).
    #[serde(default)]
    pub bymonthday: Vec<u32>,
    /// Months 1..=12 (YEARLY).
    #[serde(default)]
    pub bymonth: Vec<u32>,
    #[serde(default = "default_hour")]
    pub byhour: u32,
    #[serde(default)]
    pub byminute: u32,
    /// 按间隔: every N hours (HOURLY).
    #[serde(default = "default_interval")]
    pub interval_hours: u32,
}

impl Default for AutomationSchedule {
    fn default() -> Self {
        Self {
            freq: ScheduleFreq::DAILY,
            interval: 1,
            byday: ALL_DAYS.iter().map(|s| s.to_string()).collect(),
            bymonthday: vec![],
            bymonth: vec![],
            byhour: 9,
            byminute: 0,
            interval_hours: 1,
        }
    }
}

const ALL_DAYS: [&str; 7] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    pub id: String,
    pub name: String,
    /// The prompt to send when this automation fires.
    pub prompt: String,
    /// Comma-separated workspace directories (first entry is the run cwd).
    #[serde(default)]
    pub cwds: String,
    /// "ACTIVE" | "PAUSED".
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub model_is_thinking: bool,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub expert_id: Option<String>,
    #[serde(default)]
    pub expert_name: Option<String>,
    #[serde(default)]
    pub connector_ids: Vec<String>,
    /// "fullAccess" | "default".
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    /// "recurring" | "once".
    #[serde(default = "default_schedule_type")]
    pub schedule_type: String,
    #[serde(default)]
    pub schedule: AutomationSchedule,
    /// Once mode: YYYY-MM-DD.
    #[serde(default)]
    pub scheduled_date: Option<String>,
    /// Once mode: HH:MM.
    #[serde(default)]
    pub scheduled_time: Option<String>,
    /// Recurring validity window (YYYY-MM-DD, inclusive).
    #[serde(default)]
    pub valid_from_date: Option<String>,
    #[serde(default)]
    pub valid_until_date: Option<String>,
    #[serde(default)]
    pub push_to_we_chat: bool,
    #[serde(default)]
    pub last_run_at: Option<String>,
    #[serde(default)]
    pub next_run_at: Option<String>,
    pub created_at: String,
}

fn default_status() -> String {
    "ACTIVE".into()
}
fn default_permission_mode() -> String {
    "fullAccess".into()
}
fn default_schedule_type() -> String {
    "recurring".into()
}

/// A single run-history entry (运行记录 / inbox item).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRunRecord {
    pub id: String,
    pub automation_id: String,
    pub automation_name: String,
    /// "running" | "success" | "failed".
    pub status: String,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AutomationStore {
    #[serde(default)]
    pub automations: Vec<Automation>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RunRecordStore {
    #[serde(default)]
    pub records: Vec<AutomationRunRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSnapshot {
    pub automations: Vec<Automation>,
    pub records: Vec<AutomationRunRecord>,
}

// ---------- persistence ----------

fn grok_home() -> PathBuf {
    if let Ok(custom) = std::env::var("GROK_HOME") {
        return PathBuf::from(custom);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

fn store_path() -> PathBuf {
    grok_home().join("openbuddy-automations.json")
}
fn records_path() -> PathBuf {
    grok_home().join("openbuddy-automation-records.json")
}

fn write_json(path: &PathBuf, body: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body).map_err(|e| format!("write tmp: {e}"))?;
    if std::fs::rename(&tmp, path).is_err() {
        std::fs::write(path, body).map_err(|e| format!("write store: {e}"))?;
    }
    Ok(())
}

/// Read the automation store. Missing/corrupt → empty (never block on this).
/// Accepts the legacy v1 shape ({schedule:{type:"daily"|...}}, lowercase
/// status, single `cwd` string) and migrates it in memory.
fn read_store() -> AutomationStore {
    let Ok(content) = std::fs::read_to_string(store_path()) else {
        return AutomationStore::default();
    };
    if let Ok(store) = serde_json::from_str::<AutomationStore>(&content) {
        return store;
    }
    // Legacy fallback: reshape each automation object, then parse.
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return AutomationStore::default();
    };
    migrate_legacy_json(&mut value);
    serde_json::from_value(value).unwrap_or_default()
}

/// Convert legacy v1 automation objects to the current model, in place.
fn migrate_legacy_json(root: &mut serde_json::Value) {
    let Some(items) = root.get_mut("automations").and_then(|a| a.as_array_mut()) else {
        return;
    };
    for item in items {
        let Some(obj) = item.as_object_mut() else { continue };
        // status: "active"|"paused" → "ACTIVE"|"PAUSED"
        if let Some(status) = obj.get("status").and_then(|s| s.as_str()) {
            let upper = status.to_uppercase();
            obj.insert("status".into(), serde_json::Value::String(upper));
        }
        // cwd → cwds
        if !obj.contains_key("cwds") {
            if let Some(cwd) = obj.get("cwd").and_then(|c| c.as_str()) {
                obj.insert("cwds".into(), serde_json::Value::String(cwd.to_string()));
            }
        }
        obj.remove("cwd");
        // schedule {type: ...} → {freq: ...} (+ once fields)
        let Some(schedule) = obj.get("schedule").cloned() else { continue };
        if schedule.get("freq").is_some() {
            continue; // already current
        }
        let Some(kind) = schedule.get("type").and_then(|t| t.as_str()) else {
            continue;
        };
        let parse_time = |key: &str| -> (u32, u32) {
            schedule
                .get(key)
                .and_then(|t| t.as_str())
                .and_then(|t| {
                    let mut parts = t.split(':');
                    let h = parts.next()?.parse().ok()?;
                    let m = parts.next()?.parse().ok()?;
                    Some((h, m))
                })
                .unwrap_or((9, 0))
        };
        let mut new_schedule = serde_json::json!({
            "freq": "DAILY",
            "interval": 1,
            "byday": ALL_DAYS,
            "bymonthday": [],
            "bymonth": [],
            "byhour": 9,
            "byminute": 0,
            "intervalHours": 1,
        });
        match kind {
            "once" => {
                obj.insert(
                    "scheduleType".into(),
                    serde_json::Value::String("once".into()),
                );
                if let Some(at) = schedule.get("at").and_then(|t| t.as_str()) {
                    if let Ok(dt) = DateTime::parse_from_rfc3339(at) {
                        let local = dt.with_timezone(&Local);
                        obj.insert(
                            "scheduledDate".into(),
                            serde_json::Value::String(local.format("%Y-%m-%d").to_string()),
                        );
                        obj.insert(
                            "scheduledTime".into(),
                            serde_json::Value::String(local.format("%H:%M").to_string()),
                        );
                    }
                }
            }
            "daily" => {
                let (h, m) = parse_time("time");
                new_schedule["byhour"] = h.into();
                new_schedule["byminute"] = m.into();
            }
            "weekly" => {
                let (h, m) = parse_time("time");
                new_schedule["freq"] = "WEEKLY".into();
                new_schedule["byhour"] = h.into();
                new_schedule["byminute"] = m.into();
                // legacy weekdays: 0=Sunday .. 6=Saturday
                let codes: Vec<&str> = schedule
                    .get("weekdays")
                    .and_then(|w| w.as_array())
                    .map(|days| {
                        days.iter()
                            .filter_map(|d| d.as_u64())
                            .filter_map(|d| {
                                ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
                                    .get(d as usize)
                                    .copied()
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                if !codes.is_empty() {
                    new_schedule["byday"] = serde_json::json!(codes);
                }
            }
            "monthly" => {
                let (h, m) = parse_time("time");
                new_schedule["freq"] = "MONTHLY".into();
                new_schedule["byhour"] = h.into();
                new_schedule["byminute"] = m.into();
                if let Some(day) = schedule.get("day").and_then(|d| d.as_u64()) {
                    new_schedule["bymonthday"] = serde_json::json!([day]);
                }
            }
            _ => {}
        }
        obj.insert("schedule".into(), new_schedule);
    }
}

fn write_store(store: &AutomationStore) -> Result<(), String> {
    let body =
        serde_json::to_string_pretty(store).map_err(|e| format!("serialize automations: {e}"))?;
    write_json(&store_path(), &body)
}

fn read_records() -> RunRecordStore {
    let Ok(content) = std::fs::read_to_string(records_path()) else {
        return RunRecordStore::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

const MAX_RECORDS: usize = 500;

fn write_records(store: &mut RunRecordStore) -> Result<(), String> {
    // Cap the table: keep the newest records (by startedAt, stable order).
    if store.records.len() > MAX_RECORDS {
        let drop = store.records.len() - MAX_RECORDS;
        store.records.drain(0..drop);
    }
    let body =
        serde_json::to_string_pretty(store).map_err(|e| format!("serialize records: {e}"))?;
    write_json(&records_path(), &body)
}

/// Append a "running" record and return its id.
fn record_run_started(automation: &Automation, started_at: &str) -> String {
    let mut records = read_records();
    let id = uuid::Uuid::now_v7().to_string();
    records.records.push(AutomationRunRecord {
        id: id.clone(),
        automation_id: automation.id.clone(),
        automation_name: automation.name.clone(),
        status: "running".into(),
        started_at: started_at.into(),
        finished_at: None,
        session_id: None,
        archived: false,
    });
    let _ = write_records(&mut records);
    id
}

/// Finalize a record as success/failed with the linked session.
fn record_run_finished(record_id: &str, ok: bool, session_id: Option<&str>) {
    let mut records = read_records();
    let now = Local::now().to_rfc3339();
    for r in &mut records.records {
        if r.id == record_id {
            r.status = if ok { "success".into() } else { "failed".into() };
            r.finished_at = Some(now.clone());
            if let Some(sid) = session_id {
                r.session_id = Some(sid.into());
            }
        }
    }
    let _ = write_records(&mut records);
}

// ---------- scheduling ----------

fn now_local() -> DateTime<Local> {
    Local::now()
}

fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let mut parts = s.split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((h, m))
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok()
}

fn at_local(date: NaiveDate, h: u32, m: u32) -> Option<DateTime<Local>> {
    date.and_time(NaiveTime::from_hms_opt(h, m, 0)?)
        .and_local_timezone(Local)
        .single()
}

fn weekday_code(date: NaiveDate) -> &'static str {
    match date.weekday() {
        Weekday::Mon => "MO",
        Weekday::Tue => "TU",
        Weekday::Wed => "WE",
        Weekday::Thu => "TH",
        Weekday::Fri => "FR",
        Weekday::Sat => "SA",
        Weekday::Sun => "SU",
    }
}

/// Monday of the week containing `date` (week-parity anchor for 双周).
fn week_start(date: NaiveDate) -> NaiveDate {
    let offset = date.weekday().num_days_from_monday() as i64;
    date - Duration::days(offset)
}

fn recurring_next(sched: &AutomationSchedule, anchor: &DateTime<Local>, from: DateTime<Local>) -> Option<DateTime<Local>> {
    let h = sched.byhour.min(23);
    let m = sched.byminute.min(59);
    match sched.freq {
        ScheduleFreq::DAILY => {
            for i in 0..2 {
                let date = (from + Duration::days(i)).date_naive();
                if let Some(candidate) = at_local(date, h, m) {
                    if candidate > from {
                        return Some(candidate);
                    }
                }
            }
            None
        }
        ScheduleFreq::WEEKLY => {
            let interval = sched.interval.max(1).min(2) as i64;
            let anchor_week = week_start(anchor.date_naive());
            for i in 0..(7 * interval + 7) {
                let date = (from + Duration::days(i)).date_naive();
                if !sched.byday.iter().any(|d| d == weekday_code(date)) {
                    continue;
                }
                if (week_start(date) - anchor_week).num_weeks() % interval != 0 {
                    continue;
                }
                if let Some(candidate) = at_local(date, h, m) {
                    if candidate > from {
                        return Some(candidate);
                    }
                }
            }
            None
        }
        ScheduleFreq::MONTHLY => {
            if sched.bymonthday.is_empty() {
                return None;
            }
            for i in 0..62 {
                let date = (from + Duration::days(i)).date_naive();
                if !sched.bymonthday.contains(&date.day()) {
                    continue;
                }
                if let Some(candidate) = at_local(date, h, m) {
                    if candidate > from {
                        return Some(candidate);
                    }
                }
            }
            None
        }
        ScheduleFreq::YEARLY => {
            let month = *sched.bymonth.first()?;
            let day = *sched.bymonthday.first()?;
            for year_offset in 0..2 {
                let year = from.year() + year_offset;
                let date = NaiveDate::from_ymd_opt(year, month, day)?;
                if let Some(candidate) = at_local(date, h, m) {
                    if candidate > from {
                        return Some(candidate);
                    }
                }
            }
            None
        }
        ScheduleFreq::HOURLY => {
            // 按间隔: fire at 00:00 + k*intervalHours on selected weekdays.
            let step = sched.interval_hours.clamp(1, 24);
            let byday = if sched.byday.is_empty() {
                ALL_DAYS.iter().map(|s| s.to_string()).collect::<Vec<_>>()
            } else {
                sched.byday.clone()
            };
            for i in 0..8 {
                let date = (from + Duration::days(i)).date_naive();
                if !byday.iter().any(|d| d == weekday_code(date)) {
                    continue;
                }
                let mut hour = 0;
                while hour < 24 {
                    if let Some(candidate) = at_local(date, hour, 0) {
                        if candidate > from {
                            return Some(candidate);
                        }
                    }
                    hour += step;
                }
            }
            None
        }
    }
}

/// Compute the next fire time for an automation after `from`, honoring the
/// validity window. Returns an RFC3339 string in local time.
fn compute_next_run(a: &Automation, from: DateTime<Local>) -> Option<String> {
    if a.status != "ACTIVE" {
        return None;
    }
    if a.schedule_type == "once" {
        let date = parse_date(a.scheduled_date.as_deref()?)?;
        let (h, m) = parse_hhmm(a.scheduled_time.as_deref().unwrap_or("09:00"))?;
        let candidate = at_local(date, h, m)?;
        // Fired or missed once-tasks have no upcoming run.
        return (candidate > from).then(|| candidate.to_rfc3339());
    }
    let valid_from = a.valid_from_date.as_deref().and_then(parse_date);
    let valid_until = a.valid_until_date.as_deref().and_then(parse_date);
    if let Some(until) = valid_until {
        if from.date_naive() > until {
            return None; // 已过期
        }
    }
    // Clamp the search start to the validity window's first day.
    let search_from = match valid_from {
        Some(fd) if from.date_naive() < fd => at_local(fd, 0, 0)? - Duration::minutes(1),
        _ => from,
    };
    let anchor = DateTime::parse_from_rfc3339(&a.created_at)
        .map(|dt| dt.with_timezone(&Local))
        .unwrap_or(from);
    let candidate = recurring_next(&a.schedule, &anchor, search_from)?;
    if let Some(until) = valid_until {
        if candidate.date_naive() > until {
            return None;
        }
    }
    Some(candidate.to_rfc3339())
}

fn refresh_next_runs(store: &mut AutomationStore) {
    let now = now_local();
    for a in &mut store.automations {
        a.next_run_at = compute_next_run(a, now);
    }
}

fn first_cwd(a: &Automation) -> Option<String> {
    a.cwds
        .split(',')
        .map(|c| c.trim())
        .find(|c| !c.is_empty())
        .map(|c| c.to_string())
}

// ---------- Tauri commands ----------

/// Full snapshot: automations (with recomputed next runs) + run records.
#[tauri::command]
pub fn automations_snapshot() -> AutomationSnapshot {
    let mut store = read_store();
    refresh_next_runs(&mut store);
    let _ = write_store(&store);
    let records = read_records();
    AutomationSnapshot {
        automations: store.automations,
        records: records.records,
    }
}

/// Treat empty strings as absent for optional fields.
fn blank_to_none(value: &mut Option<String>) {
    if value.as_deref().map(str::trim) == Some("") {
        *value = None;
    }
}

#[tauri::command]
pub fn automations_save(automation: Automation) -> Result<Automation, String> {
    let mut store = read_store();
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
    let now = now_local().to_rfc3339();
    let mut final_automation = automation;
    final_automation.id = id.clone();
    if final_automation.created_at.is_empty() {
        final_automation.created_at = now;
    }
    final_automation.status = final_automation.status.to_uppercase();
    // Frontend sends "" for unset optionals; normalize to None.
    blank_to_none(&mut final_automation.model_id);
    blank_to_none(&mut final_automation.expert_id);
    blank_to_none(&mut final_automation.expert_name);
    blank_to_none(&mut final_automation.scheduled_date);
    blank_to_none(&mut final_automation.scheduled_time);
    blank_to_none(&mut final_automation.valid_from_date);
    blank_to_none(&mut final_automation.valid_until_date);
    final_automation.next_run_at = compute_next_run(&final_automation, now_local());

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
pub fn automations_set_status(id: String, status: String) -> Result<(), String> {
    let normalized = match status.to_uppercase().as_str() {
        "ACTIVE" => "ACTIVE",
        _ => "PAUSED",
    };
    let mut store = read_store();
    for a in &mut store.automations {
        if a.id == id {
            a.status = normalized.into();
        }
    }
    refresh_next_runs(&mut store);
    write_store(&store)
}

/// Manually fire an automation now (test run). Opens a new grok session and
/// sends the prompt — the result appears in the sidebar like any chat, and a
/// run record is written for the 运行记录 tab.
#[tauri::command]
pub async fn automations_run(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let store = read_store();
    let automation = store
        .automations
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("automation {id} not found"))?;
    let cwd = first_cwd(&automation).unwrap_or_else(|| {
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

    let started = now_local().to_rfc3339();
    let record_id = record_run_started(&automation, &started);
    let result = run_automation_once(&tx, &automation, &PathBuf::from(&cwd)).await;
    record_run_finished(
        &record_id,
        result.is_ok(),
        result.as_ref().ok().map(|s| s.as_str()),
    );
    result?;

    // Mark last-run.
    let mut store = read_store();
    for a in &mut store.automations {
        if a.id == id {
            a.last_run_at = Some(started.clone());
        }
    }
    write_store(&store)?;
    Ok(())
}

/// Open a fresh grok session and send the automation prompt.
/// Returns the new session id on success.
async fn run_automation_once(
    tx: &xai_acp_lib::AcpAgentTx,
    automation: &Automation,
    cwd: &PathBuf,
) -> Result<String, String> {
    let session_id = crate::grok::new_session(tx, cwd, automation.model_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    crate::grok::prompt(tx, &session_id, &automation.prompt)
        .await
        .map_err(|e| e.to_string())?;
    Ok(session_id)
}

#[tauri::command]
pub fn automation_records_archive(id: String, archived: bool) -> Result<(), String> {
    let mut records = read_records();
    for r in &mut records.records {
        if r.id == id {
            r.archived = archived;
        }
    }
    write_records(&mut records)
}

#[tauri::command]
pub fn automation_records_delete(id: String) -> Result<(), String> {
    let mut records = read_records();
    records.records.retain(|r| r.id != id);
    write_records(&mut records)
}

// ---------- background scheduler ----------

/// Scheduler tick. Fires any automation whose `next_run_at` has passed.
pub async fn scheduler_tick(tx: &xai_acp_lib::AcpAgentTx, default_cwd: &PathBuf) {
    let mut store = read_store();
    refresh_next_runs(&mut store);
    let now = now_local();
    let due: Vec<Automation> = store
        .automations
        .iter()
        .filter(|a| a.status == "ACTIVE")
        .filter(|a| {
            a.next_run_at
                .as_ref()
                .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
                .map(|t| t.with_timezone(&Local) <= now)
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    if due.is_empty() {
        let _ = write_store(&store);
        return;
    }
    for automation in &due {
        let cwd = first_cwd(automation)
            .map(PathBuf::from)
            .unwrap_or_else(|| default_cwd.clone());
        let started = now.to_rfc3339();
        let record_id = record_run_started(automation, &started);
        match run_automation_once(tx, automation, &cwd).await {
            Ok(session_id) => {
                record_run_finished(&record_id, true, Some(&session_id));
            }
            Err(e) => {
                tracing::warn!(error = ?e, id = %automation.id, "automation fire failed");
                record_run_finished(&record_id, false, None);
            }
        }
        for a in &mut store.automations {
            if a.id == automation.id {
                a.last_run_at = Some(started.clone());
            }
        }
        // Re-read-free recompute for this automation.
        refresh_next_runs(&mut store);
        let _ = write_store(&store);
    }
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

// ---------- unit tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    /// Helper: build a local DateTime from components.
    fn local(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(y, mo, d, h, mi, 0)
            .single()
            .expect("valid local datetime")
    }

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    // --- parse_hhmm ---

    #[test]
    fn parse_hhmm_valid() {
        assert_eq!(parse_hhmm("09:30"), Some((9, 30)));
        assert_eq!(parse_hhmm("00:00"), Some((0, 0)));
        assert_eq!(parse_hhmm("23:59"), Some((23, 59)));
    }

    #[test]
    fn parse_hhmm_invalid() {
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("12:60"), None);
        assert_eq!(parse_hhmm("abc"), None);
        assert_eq!(parse_hhmm(""), None);
        assert_eq!(parse_hhmm("12"), None);
    }

    // --- parse_date ---

    #[test]
    fn parse_date_valid() {
        assert_eq!(parse_date("2026-07-01"), Some(date(2026, 7, 1)));
        assert_eq!(parse_date(" 2026-01-15 "), Some(date(2026, 1, 15)));
    }

    #[test]
    fn parse_date_invalid() {
        assert_eq!(parse_date("not-a-date"), None);
        assert_eq!(parse_date("2026-13-01"), None);
        assert_eq!(parse_date(""), None);
    }

    // --- weekday_code ---

    #[test]
    fn weekday_code_all_days() {
        // 2026-07-06 is Monday
        assert_eq!(weekday_code(date(2026, 7, 6)), "MO");
        assert_eq!(weekday_code(date(2026, 7, 7)), "TU");
        assert_eq!(weekday_code(date(2026, 7, 8)), "WE");
        assert_eq!(weekday_code(date(2026, 7, 9)), "TH");
        assert_eq!(weekday_code(date(2026, 7, 10)), "FR");
        assert_eq!(weekday_code(date(2026, 7, 11)), "SA");
        assert_eq!(weekday_code(date(2026, 7, 12)), "SU");
    }

    // --- week_start ---

    #[test]
    fn week_start_returns_monday() {
        // Wednesday 2026-07-08 → Monday 2026-07-06
        assert_eq!(week_start(date(2026, 7, 8)), date(2026, 7, 6));
        // Monday itself
        assert_eq!(week_start(date(2026, 7, 6)), date(2026, 7, 6));
        // Sunday 2026-07-12 → Monday 2026-07-06
        assert_eq!(week_start(date(2026, 7, 12)), date(2026, 7, 6));
    }

    // --- recurring_next: DAILY ---

    #[test]
    fn daily_next_same_day_future() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::DAILY,
            byhour: 14,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 7, 1, 9, 0);
        let from = local(2026, 7, 6, 10, 0); // before 14:00
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 7, 6, 14, 0));
    }

    #[test]
    fn daily_next_rolls_to_tomorrow() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::DAILY,
            byhour: 9,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 7, 1, 9, 0);
        let from = local(2026, 7, 6, 10, 0); // after 09:00
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 7, 7, 9, 0));
    }

    // --- recurring_next: WEEKLY ---

    #[test]
    fn weekly_next_matching_day() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::WEEKLY,
            interval: 1,
            byday: vec!["WE".into()],
            byhour: 10,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 7, 6, 9, 0); // Monday
        let from = local(2026, 7, 6, 12, 0); // Monday noon
        let next = recurring_next(&sched, &anchor, from).unwrap();
        // Next Wednesday = 2026-07-08
        assert_eq!(next, local(2026, 7, 8, 10, 0));
    }

    #[test]
    fn weekly_biweek_skips_alternate_weeks() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::WEEKLY,
            interval: 2,
            byday: vec!["MO".into()],
            byhour: 9,
            byminute: 0,
            ..Default::default()
        };
        // Anchor week starts Mon 2026-07-06.
        let anchor = local(2026, 7, 6, 9, 0);
        // From Monday 2026-07-13 (next week, odd offset from anchor week).
        let from = local(2026, 7, 13, 10, 0);
        let next = recurring_next(&sched, &anchor, from).unwrap();
        // Should skip to Mon 2026-07-20 (even weeks from anchor).
        assert_eq!(next, local(2026, 7, 20, 9, 0));
    }

    // --- recurring_next: MONTHLY ---

    #[test]
    fn monthly_next_matching_day() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::MONTHLY,
            bymonthday: vec![15],
            byhour: 8,
            byminute: 30,
            ..Default::default()
        };
        let anchor = local(2026, 7, 1, 9, 0);
        let from = local(2026, 7, 10, 12, 0);
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 7, 15, 8, 30));
    }

    #[test]
    fn monthly_rolls_to_next_month() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::MONTHLY,
            bymonthday: vec![5],
            byhour: 9,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 7, 1, 9, 0);
        let from = local(2026, 7, 10, 12, 0); // past the 5th
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 8, 5, 9, 0));
    }

    #[test]
    fn monthly_empty_bymonthday_returns_none() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::MONTHLY,
            bymonthday: vec![],
            ..Default::default()
        };
        let anchor = local(2026, 7, 1, 9, 0);
        let from = local(2026, 7, 10, 12, 0);
        assert!(recurring_next(&sched, &anchor, from).is_none());
    }

    // --- recurring_next: YEARLY ---

    #[test]
    fn yearly_next_this_year() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::YEARLY,
            bymonth: vec![12],
            bymonthday: vec![25],
            byhour: 10,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 1, 1, 9, 0);
        let from = local(2026, 7, 1, 12, 0);
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 12, 25, 10, 0));
    }

    #[test]
    fn yearly_rolls_to_next_year() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::YEARLY,
            bymonth: vec![3],
            bymonthday: vec![1],
            byhour: 9,
            byminute: 0,
            ..Default::default()
        };
        let anchor = local(2026, 1, 1, 9, 0);
        let from = local(2026, 7, 1, 12, 0); // past March
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2027, 3, 1, 9, 0));
    }

    // --- recurring_next: HOURLY ---

    #[test]
    fn hourly_next_within_day() {
        let sched = AutomationSchedule {
            freq: ScheduleFreq::HOURLY,
            interval_hours: 3,
            byday: ALL_DAYS.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };
        let anchor = local(2026, 7, 6, 0, 0);
        let from = local(2026, 7, 6, 7, 30); // between 06:00 and 09:00
        let next = recurring_next(&sched, &anchor, from).unwrap();
        assert_eq!(next, local(2026, 7, 6, 9, 0));
    }

    // --- compute_next_run ---

    #[test]
    fn compute_next_run_paused_returns_none() {
        let a = Automation {
            id: "1".into(),
            name: "test".into(),
            prompt: "p".into(),
            status: "PAUSED".into(),
            created_at: "2026-01-01T00:00:00+08:00".into(),
            ..test_automation()
        };
        assert!(compute_next_run(&a, local(2026, 7, 6, 10, 0)).is_none());
    }

    #[test]
    fn compute_next_run_once_future() {
        let a = Automation {
            id: "1".into(),
            name: "once".into(),
            prompt: "p".into(),
            schedule_type: "once".into(),
            scheduled_date: Some("2026-12-25".into()),
            scheduled_time: Some("10:00".into()),
            created_at: "2026-01-01T00:00:00+08:00".into(),
            ..test_automation()
        };
        let result = compute_next_run(&a, local(2026, 7, 6, 10, 0));
        assert!(result.is_some());
    }

    #[test]
    fn compute_next_run_once_past_returns_none() {
        let a = Automation {
            id: "1".into(),
            name: "once".into(),
            prompt: "p".into(),
            schedule_type: "once".into(),
            scheduled_date: Some("2020-01-01".into()),
            scheduled_time: Some("10:00".into()),
            created_at: "2020-01-01T00:00:00+08:00".into(),
            ..test_automation()
        };
        assert!(compute_next_run(&a, local(2026, 7, 6, 10, 0)).is_none());
    }

    #[test]
    fn compute_next_run_expired_validity_returns_none() {
        let a = Automation {
            id: "1".into(),
            name: "expired".into(),
            prompt: "p".into(),
            valid_until_date: Some("2026-06-30".into()),
            created_at: "2026-01-01T00:00:00+08:00".into(),
            ..test_automation()
        };
        // from is after valid_until
        assert!(compute_next_run(&a, local(2026, 7, 6, 10, 0)).is_none());
    }

    // --- first_cwd ---

    #[test]
    fn first_cwd_extracts_first_entry() {
        let a = Automation {
            cwds: "/home/user, /tmp".into(),
            ..test_automation()
        };
        assert_eq!(first_cwd(&a), Some("/home/user".into()));
    }

    #[test]
    fn first_cwd_empty_returns_none() {
        let a = Automation {
            cwds: "".into(),
            ..test_automation()
        };
        assert_eq!(first_cwd(&a), None);
    }

    // --- blank_to_none ---

    #[test]
    fn blank_to_none_normalizes() {
        let mut v = Some("  ".to_string());
        blank_to_none(&mut v);
        assert_eq!(v, None);

        let mut v2 = Some("hello".to_string());
        blank_to_none(&mut v2);
        assert_eq!(v2, Some("hello".into()));

        let mut v3: Option<String> = None;
        blank_to_none(&mut v3);
        assert_eq!(v3, None);
    }

    // --- migrate_legacy_json ---

    #[test]
    fn migrate_legacy_daily() {
        let mut json = serde_json::json!({
            "automations": [{
                "id": "1",
                "name": "old",
                "prompt": "p",
                "status": "active",
                "cwd": "/home",
                "createdAt": "2025-01-01T00:00:00+08:00",
                "schedule": { "type": "daily", "time": "08:30" }
            }]
        });
        migrate_legacy_json(&mut json);
        let item = &json["automations"][0];
        assert_eq!(item["status"], "ACTIVE");
        assert_eq!(item["cwds"], "/home");
        assert_eq!(item["schedule"]["freq"], "DAILY");
        assert_eq!(item["schedule"]["byhour"], 8);
        assert_eq!(item["schedule"]["byminute"], 30);
    }

    #[test]
    fn migrate_legacy_weekly_with_weekdays() {
        let mut json = serde_json::json!({
            "automations": [{
                "id": "2",
                "name": "weekly",
                "prompt": "p",
                "status": "paused",
                "createdAt": "2025-01-01T00:00:00+08:00",
                "schedule": { "type": "weekly", "time": "17:00", "weekdays": [1, 5] }
            }]
        });
        migrate_legacy_json(&mut json);
        let sched = &json["automations"][0]["schedule"];
        assert_eq!(sched["freq"], "WEEKLY");
        // 1=MO, 5=FR in the legacy 0=Sunday mapping
        let byday = sched["byday"].as_array().unwrap();
        assert!(byday.contains(&serde_json::json!("MO")));
        assert!(byday.contains(&serde_json::json!("FR")));
    }

    #[test]
    fn migrate_legacy_already_current_is_noop() {
        let mut json = serde_json::json!({
            "automations": [{
                "id": "3",
                "name": "current",
                "prompt": "p",
                "status": "ACTIVE",
                "createdAt": "2025-01-01T00:00:00+08:00",
                "schedule": { "freq": "DAILY", "interval": 1, "byday": ["MO"], "byhour": 9, "byminute": 0 }
            }]
        });
        let before = json.clone();
        migrate_legacy_json(&mut json);
        // schedule.freq already present → no change to schedule
        assert_eq!(json["automations"][0]["schedule"], before["automations"][0]["schedule"]);
    }

    // --- helper ---

    fn test_automation() -> Automation {
        Automation {
            id: String::new(),
            name: String::new(),
            prompt: String::new(),
            cwds: String::new(),
            status: "ACTIVE".into(),
            model_id: None,
            model_is_thinking: false,
            skills: vec![],
            expert_id: None,
            expert_name: None,
            connector_ids: vec![],
            permission_mode: "fullAccess".into(),
            schedule_type: "recurring".into(),
            schedule: AutomationSchedule::default(),
            scheduled_date: None,
            scheduled_time: None,
            valid_from_date: None,
            valid_until_date: None,
            push_to_we_chat: false,
            last_run_at: None,
            next_run_at: None,
            created_at: String::new(),
        }
    }
}
