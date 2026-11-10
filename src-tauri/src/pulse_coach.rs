//! Bounded account-window observations and public, third-party reset notices.
//! Configured only by the normal desktop setup; MCP never configures or starts this module.
use crate::types::{CodexLimitsResponse, CodexQuotaForecastResponse};
use chrono::{DateTime, Days, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::Emitter;

const LEDGER_FILE: &str = "coach-observations.json";
const NOTICE_FILE: &str = "coach-notice-state.json";
const MAX_BYTES: u64 = 512 * 1024;
const MAX_DAYS: usize = 31;
const MAX_INTERVALS: usize = 256;
const MAX_GAP: i64 = 600;
const MAX_AGE: i64 = 360;
const NOTICE_AGE: i64 = 300;
static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
static IO_LOCK: Mutex<()> = Mutex::new(());
static ACTIVE_NOTICE: Mutex<Option<ResetNotice>> = Mutex::new(None);

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Ledger {
    schema_version: u8,
    identity_hash: Option<String>,
    cycles: Vec<Cycle>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cycle {
    kind: String,
    window_minutes: i64,
    resets_at: i64,
    timezone: String,
    last: Sample,
    days: Vec<Day>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Sample {
    at: i64,
    used: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Interval {
    start: i64,
    end: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Day {
    date: String,
    consumed: f64,
    intervals: Vec<Interval>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct NoticeLedger {
    schema_version: u8,
    seen: Vec<Seen>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Seen {
    id: String,
    read: bool,
    seen_at: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyObservation {
    date: String,
    consumed_percent_points: Option<f64>,
    covered_minutes: f64,
    partial: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ObservedWindow {
    kind: String,
    window_minutes: i64,
    resets_at: String,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResetNotice {
    id: String,
    summary: String,
    source_url: String,
    source_label: String,
    start_at: Option<String>,
    end_at: Option<String>,
    published_at: String,
    updated_at: String,
    is_unread: bool,
    verification: String,
    scope: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachExtras {
    observed_window: Option<ObservedWindow>,
    daily_observations: Vec<DailyObservation>,
    reset_notice: Option<ResetNotice>,
}

fn timestamp(text: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|value| value.timestamp())
}
fn iso(at: i64) -> String {
    DateTime::from_timestamp(at, 0)
        .map(|value| value.to_rfc3339())
        .unwrap_or_default()
}
fn hash_ok(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn fresh(at: i64, now: i64, age: i64) -> bool {
    (-120..=age).contains(&(now - at))
}
fn offline() -> bool {
    std::env::var("PULSE_OFFLINE").as_deref() == Ok("1")
}
fn local_zone() -> chrono_tz::Tz {
    iana_time_zone::get_timezone()
        .ok()
        .and_then(|name| name.parse().ok())
        .unwrap_or(chrono_tz::UTC)
}
fn read_bounded<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let file = fs::File::open(path).ok()?;
    if file.metadata().ok()?.len() > MAX_BYTES {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MAX_BYTES {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}
fn atomic_write<T: Serialize>(directory: &Path, name: &str, value: &T) -> Result<(), String> {
    let target = directory.join(name);
    if fs::symlink_metadata(&target).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return Err("Coach storage must be a regular file".into());
    }
    let bytes = serde_json::to_vec(value).map_err(|_| "Cannot encode coach storage")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Coach storage exceeds its limit".into());
    }
    let temporary = directory.join(format!(".coach-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|_| "Cannot persist coach observations".into())
}
fn empty_ledger() -> Ledger {
    Ledger {
        schema_version: 1,
        ..Default::default()
    }
}
fn valid_ledger(value: &Ledger) -> bool {
    value.schema_version == 1
        && value.cycles.len() <= 2
        && value.identity_hash.as_deref().is_none_or(hash_ok)
        && (value.cycles.is_empty() || value.identity_hash.is_some())
        && value.cycles.iter().all(|cycle| {
            ["session", "weekly"].contains(&cycle.kind.as_str())
                && (1..=5_256_000).contains(&cycle.window_minutes)
                && DateTime::from_timestamp(cycle.resets_at, 0).is_some()
                && cycle.timezone.parse::<chrono_tz::Tz>().is_ok()
                && cycle.last.at >= 0
                && cycle.last.at < cycle.resets_at
                && cycle.last.used.is_finite()
                && (0.0..=100.0).contains(&cycle.last.used)
                && cycle.days.len() <= MAX_DAYS
                && cycle.days.iter().all(|day| {
                    NaiveDate::parse_from_str(&day.date, "%Y-%m-%d").is_ok()
                        && day.consumed.is_finite()
                        && (0.0..=100.0).contains(&day.consumed)
                        && day.intervals.len() <= MAX_INTERVALS
                        && day.intervals.iter().all(|range| {
                            range.start >= 0
                                && range.end > range.start
                                && range.end <= cycle.last.at
                        })
                        && day
                            .intervals
                            .windows(2)
                            .all(|pair| pair[0].end <= pair[1].start)
                })
        })
}
fn read_ledger(directory: &Path) -> Ledger {
    read_bounded::<Ledger>(&directory.join(LEDGER_FILE))
        .filter(valid_ledger)
        .unwrap_or_else(empty_ledger)
}
fn read_notice_ledger(directory: &Path) -> NoticeLedger {
    read_bounded::<NoticeLedger>(&directory.join(NOTICE_FILE))
        .filter(|value| {
            value.schema_version == 1
                && value.seen.len() <= 128
                && value
                    .seen
                    .iter()
                    .all(|entry| hash_ok(&entry.id) && entry.seen_at >= 0)
        })
        .unwrap_or_else(|| NoticeLedger {
            schema_version: 1,
            seen: vec![],
        })
}
pub fn configure(directory: &Path) {
    let _ = DIRECTORY.set(directory.to_path_buf());
}

fn add_pair(cycle: &mut Cycle, previous: &Sample, next: &Sample, zone: chrono_tz::Tz) {
    if next.at <= previous.at || next.at - previous.at > MAX_GAP || next.used < previous.used {
        return;
    }
    let Some(start) = DateTime::<Utc>::from_timestamp(previous.at, 0) else {
        return;
    };
    let Some(end) = DateTime::<Utc>::from_timestamp(next.at, 0) else {
        return;
    };
    let date = end.with_timezone(&zone).date_naive();
    // The increase cannot be attributed to either day without a boundary reading.
    if start.with_timezone(&zone).date_naive() != date {
        return;
    }
    let key = date.to_string();
    let index = cycle
        .days
        .iter()
        .position(|day| day.date == key)
        .unwrap_or_else(|| {
            cycle.days.push(Day {
                date: key,
                consumed: 0.0,
                intervals: vec![],
            });
            cycle.days.len() - 1
        });
    let day = &mut cycle.days[index];
    if let Some(last) = day
        .intervals
        .last_mut()
        .filter(|range| range.end == previous.at)
    {
        last.end = next.at;
    } else if day.intervals.len() < MAX_INTERVALS {
        day.intervals.push(Interval {
            start: previous.at,
            end: next.at,
        });
    } else {
        return; // Excluded time is also excluded from the delta; it never becomes observed zero.
    }
    day.consumed += next.used - previous.used;
}

fn observe_into(
    ledger: &mut Ledger,
    identity: &str,
    limits: &CodexLimitsResponse,
    now: i64,
    zone: chrono_tz::Tz,
) {
    if !hash_ok(identity) {
        return;
    }
    let Some(at) = timestamp(&limits.updated_at).filter(|at| fresh(*at, now, MAX_AGE)) else {
        return;
    };
    if ledger.identity_hash.as_deref() != Some(identity) {
        *ledger = Ledger {
            identity_hash: Some(identity.to_string()),
            ..empty_ledger()
        };
    }
    let old = std::mem::take(&mut ledger.cycles);
    for (kind, window) in [("session", &limits.session), ("weekly", &limits.weekly)] {
        let Some(window) = window else { continue };
        let Some(minutes) = window
            .window_minutes
            .filter(|minutes| (1..=5_256_000).contains(minutes))
        else {
            continue;
        };
        let Some(reset) = window
            .resets_at
            .as_deref()
            .and_then(timestamp)
            .filter(|reset| *reset > at)
        else {
            continue;
        };
        if !window.used_percent.is_finite()
            || !(0.0..=100.0).contains(&window.used_percent)
            || !window.remaining_percent.is_finite()
            || !(0.0..=100.0).contains(&window.remaining_percent)
            || (window.used_percent + window.remaining_percent - 100.0).abs() > 0.01
        {
            continue;
        }
        let next = Sample {
            at,
            used: window.used_percent,
        };
        let mut cycle = old
            .iter()
            .find(|cycle| {
                cycle.kind == kind
                    && cycle.window_minutes == minutes
                    && cycle.resets_at == reset
                    && cycle.timezone == zone.name()
            })
            .cloned()
            .unwrap_or_else(|| Cycle {
                kind: kind.into(),
                window_minutes: minutes,
                resets_at: reset,
                timezone: zone.name().into(),
                last: next.clone(),
                days: vec![],
            });
        if at < cycle.last.at {
            ledger.cycles.push(cycle);
            continue;
        }
        if next.used < cycle.last.used {
            cycle.days.clear(); // Counter/rule changes do not share a consumption scale.
        } else {
            let previous = cycle.last.clone();
            add_pair(&mut cycle, &previous, &next, zone);
        }
        cycle.last = next;
        let earliest = DateTime::<Utc>::from_timestamp(at, 0)
            .unwrap()
            .with_timezone(&zone)
            .date_naive()
            .checked_sub_days(Days::new(30))
            .unwrap_or(NaiveDate::MIN)
            .to_string();
        cycle.days.retain(|day| day.date >= earliest);
        cycle.days.sort_by(|left, right| left.date.cmp(&right.date));
        if cycle.days.len() > MAX_DAYS {
            cycle.days.drain(..cycle.days.len() - MAX_DAYS);
        }
        ledger.cycles.push(cycle);
    }
}
pub(crate) fn observe(identity: Option<&str>, limits: &CodexLimitsResponse) {
    let (Some(directory), Some(identity)) = (DIRECTORY.get(), identity) else {
        return;
    };
    let Ok(_guard) = IO_LOCK.lock() else { return };
    let mut ledger = read_ledger(directory);
    observe_into(
        &mut ledger,
        identity,
        limits,
        Utc::now().timestamp(),
        local_zone(),
    );
    if let Err(error) = atomic_write(directory, LEDGER_FILE, &ledger) {
        log::warn!("{error}");
    }
}

fn scope_identity(directory: &Path) -> Option<String> {
    let value = read_bounded::<serde_json::Value>(&directory.join("quota-pace.json"))?;
    if value["schemaVersion"].as_u64() != Some(1) {
        return None;
    }
    value["identityHash"]
        .as_str()
        .filter(|value| hash_ok(value))
        .map(str::to_owned)
}
fn daily(cycle: &Cycle, now: i64) -> Vec<DailyObservation> {
    let Ok(zone) = cycle.timezone.parse::<chrono_tz::Tz>() else {
        return vec![];
    };
    let Some(now) = DateTime::<Utc>::from_timestamp(now, 0) else {
        return vec![];
    };
    let Some(nominal_start) = cycle
        .resets_at
        .checked_sub(cycle.window_minutes * 60)
        .and_then(|at| DateTime::<Utc>::from_timestamp(at, 0))
    else {
        return vec![];
    };
    let last = now.with_timezone(&zone).date_naive();
    let mut date = nominal_start.with_timezone(&zone).date_naive().max(
        last.checked_sub_days(Days::new(30))
            .unwrap_or(NaiveDate::MIN),
    );
    let mut result = Vec::new();
    while date <= last && result.len() < MAX_DAYS {
        let day = cycle.days.iter().find(|day| day.date == date.to_string());
        let covered: i64 = day
            .into_iter()
            .flat_map(|day| &day.intervals)
            .map(|range| range.end - range.start)
            .sum();
        result.push(DailyObservation {
            date: date.to_string(),
            consumed_percent_points: day.filter(|_| covered > 0).map(|day| day.consumed),
            covered_minutes: covered as f64 / 60.0,
            // Without exact midnight observations the calendar is intentionally a partial ledger.
            partial: true,
        });
        let Some(next) = date.succ_opt() else { break };
        date = next;
    }
    result
}
fn notice_url(text: &str) -> Option<String> {
    let mut url = reqwest::Url::parse(text).ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || text.len() > 1024
        || ![
            "x.com",
            "www.x.com",
            "twitter.com",
            "www.twitter.com",
            "openai.com",
            "www.openai.com",
        ]
        .contains(&url.host_str()?)
    {
        return None;
    }
    url.set_fragment(None);
    url.set_query(None);
    Some(url.to_string())
}
fn clean_summary(text: &str) -> Option<String> {
    let text: String = text
        .chars()
        .filter_map(|character| {
            if character.is_whitespace() {
                Some(' ')
            } else if character.is_control() {
                None
            } else {
                Some(character)
            }
        })
        .take(500)
        .collect();
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}
fn eligible_notice(data: &CodexQuotaForecastResponse, now: i64) -> Option<ResetNotice> {
    let updated = timestamp(&data.updated_at).filter(|at| fresh(*at, now, NOTICE_AGE))?;
    if data.evidence_stale
        || !fresh(
            timestamp(data.evidence_updated_at.as_deref()?)?,
            now,
            NOTICE_AGE,
        )
        || !data.has_official_signal
    {
        return None;
    }
    let alert = data.latest_alert.as_ref()?;
    if alert.kind.as_deref() != Some("watch")
        || alert.state.as_deref() != Some("active")
        || alert.pending.is_some()
        || alert.confirmed_at.is_some()
    {
        return None;
    }
    let published = timestamp(alert.source_at.as_deref()?).filter(|at| *at <= now)?;
    if data
        .last_reset_at
        .as_deref()
        .and_then(timestamp)
        .is_some_and(|at| at >= published)
    {
        return None;
    }
    let source_url = notice_url(alert.url.as_deref()?)?;
    let posts = data.evidence_posts.as_ref()?;
    if !posts.iter().any(|post| {
        alert.id.as_deref() == Some(post.id.as_str())
            || notice_url(&post.url).as_deref() == Some(source_url.as_str())
    }) || posts.iter().any(|post| {
        post.is_reply
            && post
                .reply_to_id
                .as_ref()
                .is_none_or(|id| !posts.iter().any(|parent| &parent.id == id))
    }) {
        return None;
    }
    let (start, end) = if let Some(window) = &alert.window {
        let end = timestamp(window.end_at.as_deref()?)?;
        let start = window
            .start_at
            .as_deref()
            .map(timestamp)
            .transpose_option()?;
        if end <= now
            || end - now > 7 * 86400
            || start.is_some_and(|at| at > end)
            || now - published > 7 * 86400
        {
            return None;
        }
        (start.map(iso), Some(iso(end)))
    } else {
        if alert.score != Some(83) || now - published > 86400 {
            return None;
        }
        (None, None)
    };
    if !matches!(alert.score, Some(83 | 93)) {
        return None;
    }
    let summary = clean_summary(
        alert
            .localized_summary
            .as_deref()
            .or(alert.summary.as_deref())?,
    )?;
    // Prefer original summary in the event identity so changing app language is not a new event.
    let semantic = clean_summary(alert.summary.as_deref().unwrap_or(&summary))?;
    let key = format!("coach-reset-v1|{source_url}|{published}|{semantic}|{start:?}|{end:?}");
    Some(ResetNotice {
        id: format!("{:x}", Sha256::digest(key.as_bytes())),
        summary,
        source_url,
        source_label: "codex-reset.com".into(),
        start_at: start,
        end_at: end,
        published_at: iso(published),
        updated_at: iso(updated),
        is_unread: true,
        verification: "third_party".into(),
        scope: "global".into(),
    })
}
// Distinguish an absent optional time from an invalid supplied time.
trait OptionalTimestamp {
    fn transpose_option(self) -> Option<Option<i64>>;
}
impl OptionalTimestamp for Option<Option<i64>> {
    fn transpose_option(self) -> Option<Option<i64>> {
        match self {
            None => Some(None),
            Some(Some(at)) => Some(Some(at)),
            Some(None) => None,
        }
    }
}
fn notice_current(notice: &ResetNotice, now: i64) -> bool {
    timestamp(&notice.updated_at).is_some_and(|at| fresh(at, now, NOTICE_AGE))
        && notice
            .end_at
            .as_deref()
            .and_then(timestamp)
            .is_none_or(|at| at > now)
        && (notice.end_at.is_some()
            || timestamp(&notice.published_at).is_some_and(|at| now - at <= 86400))
}
fn apply_notice(ledger: &mut NoticeLedger, notice: &mut Option<ResetNotice>, now: i64) {
    ledger
        .seen
        .retain(|entry| now - entry.seen_at <= 31 * 86400);
    if let Some(notice) = notice {
        if let Some(seen) = ledger.seen.iter().find(|seen| seen.id == notice.id) {
            notice.is_unread = !seen.read;
        } else {
            ledger.seen.push(Seen {
                id: notice.id.clone(),
                read: false,
                seen_at: now,
            });
        }
    }
    if ledger.seen.len() > 128 {
        ledger.seen.drain(..ledger.seen.len() - 128);
    }
}
fn refresh_notice(
    directory: &Path,
    result: Result<CodexQuotaForecastResponse, String>,
    now: i64,
) -> bool {
    let mut notice = result.ok().and_then(|data| eligible_notice(&data, now));
    let Ok(_guard) = IO_LOCK.lock() else {
        return false;
    };
    let mut ledger = read_notice_ledger(directory);
    apply_notice(&mut ledger, &mut notice, now);
    if let Err(error) = atomic_write(directory, NOTICE_FILE, &ledger) {
        log::warn!("{error}");
    }
    let mut active = ACTIVE_NOTICE
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let changed = *active != notice;
    *active = notice;
    changed
}
pub fn extras(
    directory: &Path,
    pace: &crate::pulse_pace::PaceSnapshot,
    now: DateTime<Utc>,
) -> CoachExtras {
    let notice = ACTIVE_NOTICE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
        .filter(|notice| notice_current(notice, now.timestamp()));
    let mut output = CoachExtras {
        observed_window: None,
        daily_observations: vec![],
        reset_notice: notice,
    };
    let Some(identity) = scope_identity(directory) else {
        return output;
    };
    let ledger = read_ledger(directory);
    if ledger.identity_hash.as_deref() != Some(&identity) {
        return output;
    }
    let selected = pace
        .windows
        .iter()
        .filter_map(|window| {
            if ["stale", "expired", "unavailable"].contains(&window.state.as_str()) {
                return None;
            }
            let minutes = window.window_minutes.filter(|minutes| *minutes > 0)?;
            let reset = timestamp(window.resets_at.as_deref()?)?;
            let left = reset - now.timestamp();
            if left <= 0 {
                return None;
            }
            Some((
                window,
                minutes,
                reset,
                window.remaining_percent?
                    / (left as f64 / (minutes as f64 * 60.0) * 100.0).min(100.0),
            ))
        })
        .min_by(|left, right| left.3.total_cmp(&right.3));
    let Some((window, minutes, reset, _)) = selected else {
        return output;
    };
    let Some(cycle) = ledger.cycles.iter().find(|cycle| {
        cycle.kind == window.kind && cycle.window_minutes == minutes && cycle.resets_at == reset
    }) else {
        return output;
    };
    output.observed_window = Some(ObservedWindow {
        kind: cycle.kind.clone(),
        window_minutes: minutes,
        resets_at: iso(reset),
    });
    output.daily_observations = daily(cycle, now.timestamp());
    output
}

#[tauri::command]
pub fn mark_pulse_notice_read(
    id: String,
    paths: tauri::State<'_, crate::pulse_desktop::PulsePaths>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let _guard = IO_LOCK.lock().map_err(|_| "Coach state is unavailable")?;
    let mut active = ACTIVE_NOTICE
        .lock()
        .map_err(|_| "Coach state is unavailable")?;
    let mut ledger = read_notice_ledger(&paths.data);
    let mut candidate = active.clone();
    acknowledge(&mut candidate, &mut ledger, &id, Utc::now().timestamp())?;
    atomic_write(&paths.data, NOTICE_FILE, &ledger)?;
    *active = candidate;
    drop(active);
    drop(_guard);
    let _ = app.emit("pulse-pace-updated", ());
    Ok(())
}

fn acknowledge(
    active: &mut Option<ResetNotice>,
    ledger: &mut NoticeLedger,
    id: &str,
    now: i64,
) -> Result<(), String> {
    let notice = active
        .as_mut()
        .filter(|notice| notice.id == id && notice_current(notice, now))
        .ok_or("This reset notice is no longer current")?;
    let entry = ledger
        .seen
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or("Reset notice state is unavailable")?;
    entry.read = true;
    notice.is_unread = false;
    Ok(())
}
pub fn start_worker(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        if let Some(directory) = DIRECTORY.get() {
            if poll_notice_with(directory, offline(), Utc::now().timestamp(), || {
                crate::codex_forecast::fetch("en")
            }) {
                let _ = app.emit("pulse-pace-updated", ());
            }
        }
        std::thread::sleep(Duration::from_secs(60));
    });
}

fn poll_notice_with(
    directory: &Path,
    is_offline: bool,
    now: i64,
    fetch: impl FnOnce() -> Result<CodexQuotaForecastResponse, String>,
) -> bool {
    if is_offline {
        return false;
    }
    refresh_notice(directory, fetch(), now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CodexForecastAlert, CodexForecastPost, CodexLimitWindow};
    fn t() -> i64 {
        timestamp("2026-11-09T12:00:00Z").unwrap()
    }
    fn identity() -> String {
        "a".repeat(64)
    }
    fn quota(at: i64, used: f64) -> CodexLimitsResponse {
        CodexLimitsResponse {
            identity_revision: None,
            session: None,
            weekly: Some(CodexLimitWindow {
                used_percent: used,
                remaining_percent: 100.0 - used,
                window_minutes: Some(10080),
                resets_at: Some(iso(t() + 7 * 86400)),
            }),
            credits: None,
            credits_is_mock: false,
            reset_credits_available_count: None,
            reset_credits: None,
            updated_at: iso(at),
            source: "oauth".into(),
            account: None,
            membership_level: None,
            workspace_name: None,
            subscription_expires_at: None,
            subscription_will_renew: None,
        }
    }
    fn add(ledger: &mut Ledger, at: i64, used: f64) {
        observe_into(ledger, &identity(), &quota(at, used), at, chrono_tz::UTC);
    }
    fn folder() -> PathBuf {
        let path = std::env::temp_dir().join(format!("pulse-coach-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        path
    }
    fn clean(path: &Path) {
        assert!(path.is_absolute() && path.starts_with(std::env::temp_dir()));
        for file in fs::read_dir(path).unwrap() {
            fs::remove_file(file.unwrap().path()).unwrap();
        }
        fs::remove_dir(path).unwrap();
    }
    fn forecast(now: i64) -> CodexQuotaForecastResponse {
        let source = "https://x.com/thsottiaux/status/1";
        let alert: CodexForecastAlert = serde_json::from_value(serde_json::json!({
            "id":"post-1","kind":"watch","state":"active","source_at":iso(now-60),"summary":"A public reset announcement",
            "url":source,"score":93,"window":{"start_at":iso(now+600),"end_at":iso(now+3600),"time_zone":"UTC"}
        })).unwrap();
        let post: CodexForecastPost = serde_json::from_value(serde_json::json!({
            "id":"post-1","text":"Public source text","url":source,"at":iso(now-60)
        }))
        .unwrap();
        CodexQuotaForecastResponse {
            updated_at: iso(now),
            last_reset_at: None,
            has_official_signal: true,
            latest_alert: Some(alert),
            recent_posts: None,
            evidence_posts: Some(vec![post]),
            evidence_stale: false,
            evidence_updated_at: Some(iso(now)),
        }
    }
    #[test]
    fn ledger_counts_only_observed_increment_and_preserves_unknown_calendar_days() {
        let mut ledger = empty_ledger();
        add(&mut ledger, t(), 40.0);
        add(&mut ledger, t() + 60, 41.0);
        add(&mut ledger, t() + 60, 41.0); // a shared in-flight response is not a second increment
        add(&mut ledger, t() - 60, 39.0);
        let days = daily(&ledger.cycles[0], t() + 60);
        let last = days.last().unwrap();
        assert_eq!(last.consumed_percent_points, Some(1.0));
        assert_eq!(last.covered_minutes, 1.0);
        assert!(last.partial);
        assert!(days[..days.len() - 1]
            .iter()
            .all(|day| day.consumed_percent_points.is_none() && day.covered_minutes == 0.0));
        assert!(valid_ledger(&ledger));
    }
    #[test]
    fn midnight_delta_is_not_divided_or_assigned_to_either_unknown_day() {
        let mut ledger = empty_ledger();
        let a = timestamp("2026-11-09T15:59:00Z").unwrap();
        let zone = chrono_tz::Asia::Shanghai;
        for (at, used) in [(a, 10.0), (a + 120, 13.0), (a + 180, 14.0)] {
            observe_into(&mut ledger, &identity(), &quota(at, used), at, zone);
        }
        let days = daily(&ledger.cycles[0], a + 180);
        assert_eq!(days[days.len() - 2].consumed_percent_points, None);
        assert_eq!(days.last().unwrap().consumed_percent_points, Some(1.0));
        assert_eq!(days.last().unwrap().covered_minutes, 1.0);
    }
    #[test]
    fn gaps_are_unobserved_and_counter_decrease_starts_a_new_scale() {
        let mut ledger = empty_ledger();
        for (at, used) in [
            (t(), 10.0),
            (t() + 60, 11.0),
            (t() + 661, 14.0),
            (t() + 721, 14.0),
        ] {
            add(&mut ledger, at, used);
        }
        let day = daily(&ledger.cycles[0], t() + 721).pop().unwrap();
        assert_eq!(day.consumed_percent_points, Some(1.0));
        assert_eq!(day.covered_minutes, 2.0);
        add(&mut ledger, t() + 780, 3.0);
        assert!(ledger.cycles[0].days.is_empty());
        add(&mut ledger, t() + 840, 4.0);
        let day = daily(&ledger.cycles[0], t() + 840).pop().unwrap();
        assert_eq!(day.consumed_percent_points, Some(1.0));
        assert_eq!(day.covered_minutes, 1.0);
    }
    #[test]
    fn identities_window_rules_and_timezone_never_share_cycle_totals() {
        for change in ["identity", "reset", "duration", "timezone"] {
            let mut ledger = empty_ledger();
            add(&mut ledger, t(), 10.0);
            add(&mut ledger, t() + 60, 11.0);
            let mut next = quota(t() + 120, 12.0);
            if change == "reset" {
                next.weekly.as_mut().unwrap().resets_at = Some(iso(t() + 8 * 86400));
            }
            if change == "duration" {
                next.weekly.as_mut().unwrap().window_minutes = Some(1440);
            }
            let selected_identity = if change == "identity" {
                "b".repeat(64)
            } else {
                identity()
            };
            observe_into(
                &mut ledger,
                &selected_identity,
                &next,
                t() + 120,
                if change == "timezone" {
                    chrono_tz::Asia::Shanghai
                } else {
                    chrono_tz::UTC
                },
            );
            assert!(ledger.cycles[0].days.is_empty(), "{change}");
        }
    }
    #[test]
    fn history_is_bounded_to_thirty_one_observed_days_without_filling_gaps() {
        let mut ledger = empty_ledger();
        for day in 0..36 {
            for (offset, increment) in [(0, 0.0), (60, 0.5)] {
                let at = t() + day * 86400 + offset;
                let mut next = quota(at, 10.0 + day as f64 + increment);
                next.weekly.as_mut().unwrap().window_minutes = Some(60 * 24 * 60);
                next.weekly.as_mut().unwrap().resets_at = Some(iso(t() + 60 * 86400));
                observe_into(&mut ledger, &identity(), &next, at, chrono_tz::UTC);
            }
        }
        assert_eq!(ledger.cycles[0].days.len(), 31);
        assert!(ledger.cycles[0].days.iter().all(|day| day.consumed == 0.5));
        assert!(valid_ledger(&ledger));
    }
    #[test]
    fn storage_is_atomic_bounded_and_old_missing_or_corrupt_data_is_unknown() {
        let path = folder();
        assert!(read_ledger(&path).cycles.is_empty());
        let mut ledger = empty_ledger();
        add(&mut ledger, t(), 10.0);
        add(&mut ledger, t() + 60, 11.0);
        atomic_write(&path, LEDGER_FILE, &ledger).unwrap();
        let bytes = fs::read(path.join(LEDGER_FILE)).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("access_token"));
        assert_eq!(read_ledger(&path).cycles[0].days[0].consumed, 1.0);
        fs::write(path.join(LEDGER_FILE), r#"{"schemaVersion":99}"#).unwrap();
        assert!(read_ledger(&path).cycles.is_empty());
        fs::write(path.join(LEDGER_FILE), vec![b' '; MAX_BYTES as usize + 1]).unwrap();
        assert!(read_ledger(&path).cycles.is_empty());
        clean(&path);
    }
    #[test]
    fn missing_profile_reads_and_unconfigured_observer_never_create_mcp_files() {
        let path =
            std::env::temp_dir().join(format!("pulse-coach-missing-{}", uuid::Uuid::new_v4()));
        assert!(read_ledger(&path).cycles.is_empty());
        assert!(read_notice_ledger(&path).seen.is_empty());
        let pace =
            crate::pulse_pace::read_snapshot(&path, DateTime::from_timestamp(t(), 0).unwrap());
        let value = extras(&path, &pace, DateTime::from_timestamp(t(), 0).unwrap());
        assert!(value.daily_observations.is_empty());
        assert!(!path.exists());
        assert!(DIRECTORY.get().is_none());
        observe(Some(&identity()), &quota(t(), 10.0));
        assert!(!path.exists());
    }
    #[test]
    fn valid_notice_is_explicitly_global_third_party_and_excludes_feed_text() {
        let data = forecast(t());
        let notice = eligible_notice(&data, t()).unwrap();
        assert_eq!(notice.scope, "global");
        assert_eq!(notice.verification, "third_party");
        let text = serde_json::to_string(&notice).unwrap();
        assert!(!text.contains("Public source text"));
        assert!(!text.contains("93%"));
        assert!(notice_current(&notice, t()));
        assert!(!notice_current(&notice, t() + NOTICE_AGE + 1));
    }
    #[test]
    fn stale_completed_withdrawn_answered_and_unsupported_signals_are_not_notices() {
        for case in [
            "stale",
            "future",
            "withdrawn",
            "expired",
            "done",
            "confirmed",
            "answered",
            "score",
            "evidence",
            "context",
            "unsafe",
            "no_original",
            "no_signal",
        ] {
            let mut data = forecast(t());
            let alert = data.latest_alert.as_mut().unwrap();
            match case {
                "stale" => data.updated_at = iso(t() - 301),
                "future" => data.updated_at = iso(t() + 121),
                "withdrawn" => alert.state = Some("withdrawn".into()),
                "expired" => alert.window.as_mut().unwrap().end_at = Some(iso(t())),
                "done" => alert.pending = Some("done".into()),
                "confirmed" => alert.confirmed_at = Some(iso(t())),
                "answered" => data.last_reset_at = Some(iso(t())),
                "score" => alert.score = Some(50),
                "evidence" => data.evidence_stale = true,
                "context" => data.evidence_posts.as_mut().unwrap()[0].is_reply = true,
                "unsafe" => alert.url = Some("https://untrusted.example/reset".into()),
                "no_original" => data.evidence_posts = Some(vec![]),
                "no_signal" => data.has_official_signal = false,
                _ => unreachable!(),
            }
            assert!(eligible_notice(&data, t()).is_none(), "{case}");
        }
    }
    #[test]
    fn old_untimed_messages_do_not_become_new_and_future_timed_announcements_can_remain_valid() {
        let mut data = forecast(t());
        let alert = data.latest_alert.as_mut().unwrap();
        alert.source_at = Some(iso(t() - 2 * 86400));
        alert.score = Some(83);
        assert!(eligible_notice(&data, t()).is_some());
        data.latest_alert.as_mut().unwrap().window = None;
        assert!(eligible_notice(&data, t()).is_none());
        data.latest_alert.as_mut().unwrap().source_at = Some(iso(t() - 3600));
        assert!(eligible_notice(&data, t()).is_some());
    }
    #[test]
    fn notices_deduplicate_translations_and_tracking_but_material_updates_are_new() {
        let data = forecast(t());
        let original = eligible_notice(&data, t()).unwrap();
        let mut translated = data.clone();
        translated.latest_alert.as_mut().unwrap().summary =
            Some(" A public\n  reset announcement ".into());
        translated.latest_alert.as_mut().unwrap().localized_summary =
            Some("Translated public summary".into());
        translated.latest_alert.as_mut().unwrap().url =
            Some("https://x.com/thsottiaux/status/1?utm_source=test#fragment".into());
        assert_eq!(eligible_notice(&translated, t()).unwrap().id, original.id);
        translated
            .latest_alert
            .as_mut()
            .unwrap()
            .window
            .as_mut()
            .unwrap()
            .end_at = Some(iso(t() + 7200));
        assert_ne!(eligible_notice(&translated, t()).unwrap().id, original.id);
        let path = folder();
        let mut ledger = NoticeLedger {
            schema_version: 1,
            seen: vec![],
        };
        let mut current = Some(original.clone());
        apply_notice(&mut ledger, &mut current, t());
        assert!(current.as_ref().unwrap().is_unread);
        assert!(acknowledge(
            &mut current,
            &mut ledger,
            &original.id,
            t() + NOTICE_AGE + 1
        )
        .is_err());
        assert!(acknowledge(&mut current, &mut ledger, "old-id", t()).is_err());
        acknowledge(&mut current, &mut ledger, &original.id, t()).unwrap();
        atomic_write(&path, NOTICE_FILE, &ledger).unwrap();
        let text = fs::read_to_string(path.join(NOTICE_FILE)).unwrap();
        assert!(
            !text.contains("summary") && !text.contains("Public") && !text.contains("sourceUrl")
        );
        let mut ledger = read_notice_ledger(&path);
        let mut current = Some(original);
        apply_notice(&mut ledger, &mut current, t() + 60);
        assert!(!current.as_ref().unwrap().is_unread);
        assert!(acknowledge(
            &mut current,
            &mut ledger,
            &data.latest_alert.unwrap().id.unwrap(),
            t()
        )
        .is_err());
        let mut none = None;
        apply_notice(&mut ledger, &mut none, t() + 60);
        assert_eq!(ledger.seen.len(), 1);
        clean(&path);
    }
    #[test]
    fn offline_poll_does_not_fetch_create_files_or_reclassify_an_old_message() {
        let path = folder();
        assert!(!poll_notice_with(&path, true, t(), || panic!(
            "Offline must never request the network"
        )));
        assert_eq!(fs::read_dir(&path).unwrap().count(), 0);
        clean(&path);
    }
    #[test]
    fn presentation_requires_the_same_identity_and_exact_current_window() {
        let path = folder();
        let mut ledger = empty_ledger();
        add(&mut ledger, t(), 20.0);
        add(&mut ledger, t() + 60, 21.0);
        atomic_write(&path, LEDGER_FILE, &ledger).unwrap();
        let quota = serde_json::json!({"schemaVersion":1,"identityHash":identity(),"updatedAt":t()+60,"failed":false,"reason":null,
            "windows":[{"kind":"weekly","windowMinutes":10080,"resetsAt":t()+7*86400,
                "points":[{"at":t(),"used":20},{"at":t()+60,"used":21}]}]});
        fs::write(
            path.join("quota-pace.json"),
            serde_json::to_vec(&quota).unwrap(),
        )
        .unwrap();
        let now = DateTime::from_timestamp(t() + 60, 0).unwrap();
        let pace = crate::pulse_pace::read_snapshot(&path, now);
        let output = extras(&path, &pace, now);
        assert_eq!(output.observed_window.as_ref().unwrap().kind, "weekly");
        assert_eq!(
            output
                .daily_observations
                .last()
                .unwrap()
                .consumed_percent_points,
            Some(1.0)
        );
        let serialized = serde_json::to_string(&output).unwrap();
        assert!(!serialized.contains("identityHash") && !serialized.contains(&identity()));
        ledger.identity_hash = Some("b".repeat(64));
        atomic_write(&path, LEDGER_FILE, &ledger).unwrap();
        assert!(extras(&path, &pace, now).observed_window.is_none());
        ledger.identity_hash = Some(identity());
        ledger.cycles[0].resets_at += 3600;
        atomic_write(&path, LEDGER_FILE, &ledger).unwrap();
        assert!(extras(&path, &pace, now).daily_observations.is_empty());
        clean(&path);
    }
}
