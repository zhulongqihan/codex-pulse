//! Local, identity-scoped observations of official quota windows.
//! No token-to-quota conversion, account request, or model invocation occurs here.
use crate::{
    codex_auth::CodexAuth, codex_environment::CodexEnvironment, types::CodexLimitsResponse,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

const FILE_NAME: &str = "quota-pace.json";
const MAX_BYTES: u64 = 128 * 1024;
const MAX_POINTS: usize = 64;
const MAX_GAP: i64 = 10 * 60;
const MAX_AGE: i64 = 6 * 60;
const MIN_SPACING: i64 = 60;
const MIN_SPAN: i64 = 15 * 60;
const LOOKBACK: i64 = 60 * 60;
const MIN_POINTS: usize = 4;
const OBSERVATION_ERROR: f64 = 1.0; // two integer-percentage observations each may be rounded by 0.5 pp
static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
static IO_LOCK: Mutex<()> = Mutex::new(());

/// Configure only in the normal desktop process. The MCP early branch never does this.
pub fn configure(directory: &Path) {
    let _ = DIRECTORY.set(directory.to_path_buf());
}

/// Desktop-only identity watcher. It performs no network request and must never run in MCP mode.
/// Returns true only when the sampling identity or its unavailable reason changed.
pub fn reconcile_current_identity() -> bool {
    let Some(directory) = DIRECTORY.get() else {
        return false;
    };
    let (identity, reason) = if std::env::var("PULSE_OFFLINE").as_deref() == Ok("1") {
        (None, "offline")
    } else {
        match crate::codex_auth::load_codex_auth() {
            Ok(auth) if !auth.is_chatgpt => (None, "api_key"),
            Ok(auth) => (
                stable_identity(
                    &auth,
                    &crate::codex_environment::selected_codex_environment(),
                ),
                "identity_unavailable",
            ),
            Err(_) => (None, "login_required"),
        }
    };
    let Ok(_guard) = IO_LOCK.lock() else {
        return false;
    };
    let mut store = read_store(directory);
    if !reconcile_store(&mut store, identity, reason) {
        return false;
    }
    if write_store(directory, &store).is_err() {
        log::warn!("Could not invalidate local quota observations");
    }
    true
}

fn reconcile_store(store: &mut Store, identity: Option<String>, unavailable_reason: &str) -> bool {
    if store.identity_hash == identity
        && (identity.is_some() || store.reason.as_deref() == Some(unavailable_reason))
    {
        return false;
    }
    *store = Store {
        reason: Some(
            if identity.is_some() {
                "sampling"
            } else {
                unavailable_reason
            }
            .into(),
        ),
        identity_hash: identity,
        ..Default::default()
    };
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Point {
    at: i64,
    used: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Series {
    kind: String,
    window_minutes: i64,
    resets_at: i64,
    points: Vec<Point>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Store {
    schema_version: u8,
    identity_hash: Option<String>,
    updated_at: Option<i64>,
    failed: bool,
    reason: Option<String>,
    windows: Vec<Series>,
}
impl Default for Store {
    fn default() -> Self {
        Self {
            schema_version: 1,
            identity_hash: None,
            updated_at: None,
            failed: false,
            reason: Some("no_observations".into()),
            windows: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendPoint {
    pub at: String,
    pub remaining_percent: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaceWindow {
    pub kind: String,
    pub window_minutes: Option<i64>,
    pub resets_at: Option<String>,
    pub remaining_percent: Option<f64>,
    pub state: String,
    pub sample_count: usize,
    pub sample_span_minutes: f64,
    pub observed_minutes: Option<f64>,
    pub consumed_percent_points: Option<f64>,
    pub rate_lower_per_hour: Option<f64>,
    pub rate_upper_per_hour: Option<f64>,
    pub eta_lower_minutes: Option<f64>,
    pub eta_upper_minutes: Option<f64>,
    pub risk: String,
    pub trend: Vec<TrendPoint>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaceSnapshot {
    pub schema_version: u8,
    pub generated_at: String,
    pub updated_at: Option<String>,
    pub status: String,
    pub primary_kind: Option<String>,
    pub reason: Option<String>,
    pub windows: Vec<PaceWindow>,
}

fn iso(at: i64) -> String {
    DateTime::<Utc>::from_timestamp(at, 0)
        .map(|date| date.to_rfc3339())
        .unwrap_or_default()
}
fn parse_at(text: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|at| at.timestamp())
}

fn stable_identity(auth: &CodexAuth, environment: &CodexEnvironment) -> Option<String> {
    if !auth.is_chatgpt {
        return None;
    }
    let account = auth.account_id.as_deref().filter(|id| !id.is_empty())?;
    // The access token is never persisted or hashed into identity. Only stable subject claims are used.
    let claims = auth
        .access_token
        .split('.')
        .nth(1)
        .and_then(|part| URL_SAFE_NO_PAD.decode(part).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    let subject = auth
        .user_id
        .as_deref()
        .or_else(|| {
            claims.as_ref().and_then(|value| {
                value
                    .pointer("/https:~1~1api.openai.com~1auth/chatgpt_user_id")
                    .and_then(serde_json::Value::as_str)
                    .or_else(|| value.get("sub").and_then(serde_json::Value::as_str))
            })
        })
        .filter(|id| !id.is_empty())?;
    let mut digest = Sha256::new();
    for value in [
        "pulse-quota-pace-v1",
        account,
        subject,
        &environment.home.to_string_lossy(),
    ] {
        digest.update((value.len() as u64).to_le_bytes());
        digest.update(value.as_bytes());
    }
    Some(format!("{:x}", digest.finalize()))
}

fn read_store(directory: &Path) -> Store {
    let result = (|| -> Option<Store> {
        let file = fs::File::open(directory.join(FILE_NAME)).ok()?;
        if file.metadata().ok()?.len() > MAX_BYTES {
            return None;
        }
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
        if bytes.len() as u64 > MAX_BYTES {
            return None;
        }
        let store: Store = serde_json::from_slice(&bytes).ok()?;
        valid_store(&store).then_some(store)
    })();
    result.unwrap_or_default()
}

fn valid_store(store: &Store) -> bool {
    if store.schema_version != 1 || store.windows.len() > 2 {
        return false;
    }
    let valid_timestamp = |at| at >= 0 && DateTime::<Utc>::from_timestamp(at, 0).is_some();
    if store.updated_at.is_some_and(|at| !valid_timestamp(at)) {
        return false;
    }
    if store.reason.as_deref().is_some_and(|reason| {
        ![
            "no_observations",
            "sampling",
            "identity_unavailable",
            "refresh_failed",
            "invalid_observation_time",
            "offline",
            "login_required",
            "api_key",
            "synthetic",
        ]
        .contains(&reason)
    }) {
        return false;
    }
    if store
        .identity_hash
        .as_ref()
        .is_some_and(|id| id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return false;
    }
    let mut seen = Vec::new();
    for window in &store.windows {
        if !["session", "weekly"].contains(&window.kind.as_str())
            || seen.contains(&window.kind)
            || !(1..=5_256_000).contains(&window.window_minutes)
            || window.points.len() > MAX_POINTS
            || !valid_timestamp(window.resets_at)
        {
            return false;
        }
        seen.push(window.kind.clone());
        let mut previous = None;
        for point in &window.points {
            if !point.used.is_finite()
                || !(0.0..=100.0).contains(&point.used)
                || !valid_timestamp(point.at)
                || previous.is_some_and(|last: &Point| {
                    point.at <= last.at || point.at - last.at > MAX_GAP || point.used < last.used
                })
                || point.at >= window.resets_at
            {
                return false;
            }
            previous = Some(point);
        }
    }
    store.windows.is_empty() || store.identity_hash.is_some()
}

fn write_store(directory: &Path, store: &Store) -> Result<(), String> {
    let path = directory.join(FILE_NAME);
    if fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err("Quota pace file is a link".into());
    }
    let bytes = serde_json::to_vec(store).map_err(|_| "Cannot encode quota pace")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Quota pace storage limit exceeded".into());
    }
    let temporary = directory.join(format!(".quota-pace-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|_| "Cannot persist quota pace".into())
}

fn with_store(change: impl FnOnce(&mut Store)) {
    let Some(directory) = DIRECTORY.get() else {
        return;
    };
    let Ok(_guard) = IO_LOCK.lock() else {
        return;
    };
    let mut store = read_store(directory);
    change(&mut store);
    if write_store(directory, &store).is_err() {
        log::warn!("Could not persist local quota observations");
    }
}

/// Called before the authenticated request, so a changed account cannot reuse old projections.
pub(crate) fn begin_account(auth: &CodexAuth, environment: &CodexEnvironment) -> Option<String> {
    let identity = stable_identity(auth, environment);
    with_store(|store| {
        if store.identity_hash != identity || identity.is_none() {
            *store = Store {
                identity_hash: identity.clone(),
                reason: Some(
                    if identity.is_some() {
                        "sampling"
                    } else {
                        "identity_unavailable"
                    }
                    .into(),
                ),
                ..Default::default()
            };
        }
    });
    identity
}

pub(crate) fn unavailable(reason: &str) {
    with_store(|store| {
        *store = Store {
            reason: Some(reason.into()),
            ..Default::default()
        }
    });
}

pub(crate) fn failed(identity: Option<&str>) {
    with_store(|store| {
        if store.identity_hash.as_deref() == identity && identity.is_some() {
            store.failed = true;
            store.reason = Some("refresh_failed".into());
        }
    });
}

/// Only successful, identity-rechecked official responses may enter the sampler.
pub(crate) fn observe(identity: Option<&str>, limits: &CodexLimitsResponse) {
    let now = Utc::now().timestamp();
    with_store(|store| observe_into(store, identity, limits, now));
}

fn observe_into(store: &mut Store, identity: Option<&str>, limits: &CodexLimitsResponse, now: i64) {
    if identity.is_none() || store.identity_hash.as_deref() != identity {
        return;
    }
    let Some(at) = parse_at(&limits.updated_at).filter(|at| (-120..=MAX_AGE).contains(&(now - at)))
    else {
        store.failed = true;
        store.reason = Some("invalid_observation_time".into());
        return;
    };
    // Ignore an older in-flight response instead of discarding newer account observations.
    if store.updated_at.is_some_and(|previous| at < previous) {
        return;
    }
    store.failed = false;
    store.reason = None;
    store.updated_at = Some(at);
    let old = std::mem::take(&mut store.windows);
    for (kind, window) in [("session", &limits.session), ("weekly", &limits.weekly)] {
        let Some(window) = window else {
            continue;
        };
        let Some(minutes) = window
            .window_minutes
            .filter(|minutes| (1..=5_256_000).contains(minutes))
        else {
            continue;
        };
        let Some(reset) = window
            .resets_at
            .as_deref()
            .and_then(parse_at)
            .filter(|reset| *reset > at)
        else {
            continue;
        };
        if !window.used_percent.is_finite()
            || !window.remaining_percent.is_finite()
            || !(0.0..=100.0).contains(&window.used_percent)
            || !(0.0..=100.0).contains(&window.remaining_percent)
            || (window.used_percent + window.remaining_percent - 100.0).abs() > 0.01
        {
            continue;
        }
        let mut series = old
            .iter()
            .find(|series| {
                series.kind == kind && series.window_minutes == minutes && series.resets_at == reset
            })
            .cloned()
            .unwrap_or_else(|| Series {
                kind: kind.into(),
                window_minutes: minutes,
                resets_at: reset,
                points: Vec::new(),
            });
        if let Some(last) = series.points.last() {
            if at - last.at > MAX_GAP || window.used_percent < last.used {
                series.points.clear();
            } else if at / MIN_SPACING == last.at / MIN_SPACING {
                // Coalesce one minute's requests without hiding a just-observed exhausted quota.
                // Replacing the boundary point must not leave an unrepresented >10-minute gap.
                let preceding = series
                    .points
                    .len()
                    .checked_sub(2)
                    .map(|index| &series.points[index]);
                if preceding.is_some_and(|point| at - point.at > MAX_GAP) {
                    series.points.clear();
                } else {
                    series.points.pop();
                }
            }
        }
        series.points.push(Point {
            at,
            used: window.used_percent,
        });
        series.points.retain(|point| point.at >= at - LOOKBACK);
        if series.points.len() > MAX_POINTS {
            series.points.drain(..series.points.len() - MAX_POINTS);
        }
        store.windows.push(series);
    }
}

fn empty_window(kind: &str) -> PaceWindow {
    PaceWindow {
        kind: kind.into(),
        window_minutes: None,
        resets_at: None,
        remaining_percent: None,
        state: "unavailable".into(),
        sample_count: 0,
        sample_span_minutes: 0.0,
        observed_minutes: None,
        consumed_percent_points: None,
        rate_lower_per_hour: None,
        rate_upper_per_hour: None,
        eta_lower_minutes: None,
        eta_upper_minutes: None,
        risk: "unknown".into(),
        trend: Vec::new(),
    }
}

fn project_window(series: &Series, now: i64, failed: bool) -> PaceWindow {
    let mut result = empty_window(&series.kind);
    result.window_minutes = Some(series.window_minutes);
    result.resets_at = Some(iso(series.resets_at));
    let Some(last) = series.points.last() else {
        return result;
    };
    result.remaining_percent = Some((100.0 - last.used).clamp(0.0, 100.0));
    result.sample_count = series.points.len();
    result.trend = series
        .points
        .iter()
        .map(|point| TrendPoint {
            at: iso(point.at),
            remaining_percent: (100.0 - point.used).clamp(0.0, 100.0),
        })
        .collect();
    let first = &series.points[0];
    let span = last.at - first.at;
    result.sample_span_minutes = span as f64 / 60.0;
    if series.resets_at <= now {
        result.state = "expired".into();
        result.remaining_percent = None;
        return result;
    }
    if failed || !(-120..=MAX_AGE).contains(&(now - last.at)) {
        result.state = "stale".into();
        return result;
    }
    let remaining = result.remaining_percent.unwrap();
    if remaining <= 0.0 {
        result.state = "exhausted".into();
        result.risk = "exhausted".into();
        result.eta_lower_minutes = Some(0.0);
        result.eta_upper_minutes = Some(0.0);
        return result;
    }
    if span < MIN_SPAN || series.points.len() < MIN_POINTS {
        result.state = "sampling".into();
        return result;
    }
    let consumed = last.used - first.used;
    result.observed_minutes = Some(span as f64 / 60.0);
    result.consumed_percent_points = Some(consumed);
    if consumed <= 0.0 {
        result.state = "idle".into();
        return result;
    }
    if consumed <= OBSERVATION_ERROR {
        result.state = "slow".into();
        return result;
    }
    let hours = span as f64 / 3600.0;
    let mut lower_rate = (consumed - OBSERVATION_ERROR) / hours;
    let mut upper_rate = (consumed + OBSERVATION_ERROR) / hours;
    // Include a recent >=15-minute slope, broadening the range when the current pace changed.
    if let Some(recent) = series
        .points
        .iter()
        .rev()
        .find(|point| last.at - point.at >= MIN_SPAN)
    {
        let recent_hours = (last.at - recent.at) as f64 / 3600.0;
        let recent_consumed = last.used - recent.used;
        lower_rate =
            lower_rate.min(((recent_consumed - OBSERVATION_ERROR) / recent_hours).max(0.0));
        upper_rate = upper_rate.max((recent_consumed + OBSERVATION_ERROR) / recent_hours);
    }
    result.rate_lower_per_hour = Some(lower_rate);
    result.rate_upper_per_hour = Some(upper_rate);
    if lower_rate <= 0.0 || !upper_rate.is_finite() || upper_rate <= 0.0 {
        result.state = "slow".into();
        return result;
    }
    // Subtract elapsed time from the last observation, rather than reusing a stale countdown.
    let elapsed_minutes = (now - last.at).max(0) as f64 / 60.0;
    let lower = (((remaining - 0.5).max(0.0) / upper_rate) * 60.0 - elapsed_minutes).max(0.0);
    let upper = (((remaining + 0.5).min(100.0) / lower_rate) * 60.0 - elapsed_minutes).max(0.0);
    if !lower.is_finite() || !upper.is_finite() || upper > 525_600.0 {
        result.state = "slow".into();
        return result;
    }
    result.eta_lower_minutes = Some(lower);
    result.eta_upper_minutes = Some(upper);
    result.state = "forecast".into();
    let until_reset = (series.resets_at - now) as f64 / 60.0;
    result.risk = if upper < until_reset - 5.0 {
        "before_reset"
    } else if lower > until_reset + 5.0 {
        "after_reset"
    } else {
        "near_reset"
    }
    .into();
    result
}

fn project(store: &Store, now: DateTime<Utc>) -> PaceSnapshot {
    let windows: Vec<_> = ["session", "weekly"]
        .iter()
        .map(|kind| {
            store
                .windows
                .iter()
                .find(|series| series.kind == *kind)
                .map(|series| project_window(series, now.timestamp(), store.failed))
                .unwrap_or_else(|| empty_window(kind))
        })
        .collect();
    // This is a window-specific projection, never an assertion that unknown windows are safe.
    let primary = windows
        .iter()
        .filter(|window| matches!(window.state.as_str(), "forecast" | "exhausted"))
        .min_by(|left, right| {
            left.eta_lower_minutes
                .unwrap_or(f64::MAX)
                .total_cmp(&right.eta_lower_minutes.unwrap_or(f64::MAX))
        })
        .or_else(|| windows.iter().find(|window| window.state == "sampling"))
        .or_else(|| {
            windows
                .iter()
                .find(|window| window.state == "slow" || window.state == "idle")
        })
        .or_else(|| windows.iter().find(|window| window.state == "stale"))
        .or_else(|| windows.iter().find(|window| window.state == "expired"));
    PaceSnapshot {
        schema_version: 1,
        generated_at: now.to_rfc3339(),
        updated_at: store.updated_at.map(iso),
        status: primary
            .map(|window| window.state.clone())
            .unwrap_or_else(|| "unavailable".into()),
        primary_kind: primary.map(|window| window.kind.clone()),
        reason: store.reason.clone(),
        windows,
    }
}

/// Pure read for desktop commands and MCP. Does not configure, create folders, or read authentication.
pub fn read_snapshot(directory: &Path, now: DateTime<Utc>) -> PaceSnapshot {
    let Ok(_guard) = IO_LOCK.lock() else {
        return project(&Store::default(), now);
    };
    project(&read_store(directory), now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{codex_environment::CodexRuntime, types::CodexLimitWindow};
    fn start() -> i64 {
        1_794_110_400
    }
    fn now(at: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(at, 0).unwrap()
    }
    fn identity() -> String {
        "a".repeat(64)
    }
    fn store() -> Store {
        Store {
            identity_hash: Some(identity()),
            ..Default::default()
        }
    }
    fn limits(at: i64, used: f64, reset: i64) -> CodexLimitsResponse {
        CodexLimitsResponse {
            session: Some(CodexLimitWindow {
                used_percent: used,
                remaining_percent: 100.0 - used,
                window_minutes: Some(300),
                resets_at: Some(iso(reset)),
            }),
            weekly: None,
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
    fn sample(store: &mut Store, at: i64, used: f64, reset: i64) {
        observe_into(store, Some(&identity()), &limits(at, used, reset), at);
    }
    fn steady() -> (Store, i64) {
        let mut data = store();
        let t = start();
        for step in 0..=6 {
            sample(&mut data, t + step * 300, 66.0 + step as f64, t + 6 * 3600);
        }
        (data, t + 1800)
    }
    #[test]
    fn continuous_official_observations_produce_a_quantization_bounded_window_specific_range() {
        let (data, at) = steady();
        let result = project(&data, now(at));
        let window = &result.windows[0];
        assert_eq!(result.status, "forecast");
        assert_eq!(result.primary_kind.as_deref(), Some("session"));
        assert_eq!(window.observed_minutes, Some(30.0));
        assert_eq!(window.consumed_percent_points, Some(6.0));
        assert_eq!(window.rate_lower_per_hour, Some(8.0));
        assert_eq!(window.rate_upper_per_hour, Some(16.0));
        assert!(window.eta_lower_minutes.unwrap() < 120.0);
        assert!(window.eta_upper_minutes.unwrap() > 180.0);
        assert_eq!(window.risk, "before_reset");
        assert_eq!(result.windows[1].state, "unavailable");
    }
    #[test]
    fn sparse_short_or_unchanged_and_slow_series_do_not_invent_eta() {
        let mut data = store();
        let t = start();
        let reset = t + 3600;
        for step in 0..3 {
            sample(&mut data, t + step * 300, 5.0, reset);
        }
        assert_eq!(project(&data, now(t + 600)).status, "sampling");
        sample(&mut data, t + 900, 5.0, reset);
        assert_eq!(project(&data, now(t + 900)).status, "idle");
        sample(&mut data, t + 1200, 5.5, reset);
        let result = project(&data, now(t + 1200));
        assert_eq!(result.status, "slow");
        assert!(result.windows[0].eta_upper_minutes.is_none());
    }
    #[test]
    fn reset_decrease_duration_change_and_long_gap_start_new_segments() {
        for kind in ["reset", "decrease", "duration", "gap"] {
            let (mut data, at) = steady();
            let mut next = limits(at + 300, 75.0, start() + 6 * 3600);
            match kind {
                "reset" => {
                    next.session.as_mut().unwrap().resets_at = Some(iso(start() + 12 * 3600))
                }
                "decrease" => {
                    next.session.as_mut().unwrap().used_percent = 1.0;
                    next.session.as_mut().unwrap().remaining_percent = 99.0;
                }
                "duration" => next.session.as_mut().unwrap().window_minutes = Some(1440),
                "gap" => next.updated_at = iso(at + MAX_GAP + 1),
                _ => unreachable!(),
            }
            let changed_at = parse_at(&next.updated_at).unwrap();
            observe_into(&mut data, Some(&identity()), &next, changed_at);
            assert_eq!(project(&data, now(changed_at)).status, "sampling", "{kind}");
            assert_eq!(data.windows[0].points.len(), 1, "{kind}");
        }
    }
    #[test]
    fn stale_failed_expired_or_invalid_future_readings_never_retain_forecast() {
        let (data, at) = steady();
        assert_eq!(project(&data, now(at + MAX_AGE + 1)).status, "stale");
        let mut failure = data.clone();
        failure.failed = true;
        let result = project(&failure, now(at));
        assert_eq!(result.status, "stale");
        assert!(result.windows[0].eta_lower_minutes.is_none());
        assert_eq!(project(&data, now(start() + 6 * 3600)).status, "expired");
        assert_eq!(project(&data, now(at - 121)).status, "stale");
    }
    #[test]
    fn duplicate_and_out_of_order_responses_cannot_fake_sample_count_or_discard_newer_data() {
        let (mut data, at) = steady();
        let count = data.windows[0].points.len();
        for _ in 0..20 {
            sample(&mut data, at, 72.0, start() + 6 * 3600);
        }
        sample(&mut data, at - 300, 71.0, start() + 6 * 3600);
        assert_eq!(data.windows[0].points.len(), count);
        assert_eq!(data.updated_at, Some(at));
    }
    #[test]
    fn same_minute_refresh_updates_the_real_reading_without_creating_fake_samples() {
        let mut data = store();
        let t = start() / 60 * 60;
        sample(&mut data, t, 50.0, t + 3600);
        for offset in 1..30 {
            sample(&mut data, t + offset, 50.0, t + 3600);
        }
        assert_eq!(data.windows[0].points.len(), 1);
        sample(&mut data, t + 30, 100.0, t + 3600);
        let result = project(&data, now(t + 30));
        assert_eq!(result.status, "exhausted");
        assert_eq!(result.windows[0].remaining_percent, Some(0.0));
        sample(&mut data, t + 61, 100.0, t + 3600);
        assert_eq!(data.windows[0].points.len(), 2);
    }
    #[test]
    fn coalesced_boundary_refresh_preserves_gap_and_lookback_invariants() {
        let t = start();
        let reset = t + 7200;
        let mut data = store();
        sample(&mut data, t, 5.0, reset);
        sample(&mut data, t + MAX_GAP, 6.0, reset);
        sample(&mut data, t + MAX_GAP + 30, 7.0, reset);
        assert_eq!(data.windows[0].points.len(), 1);
        assert_eq!(data.windows[0].points[0].at, t + MAX_GAP + 30);
        assert!(valid_store(&data));

        let mut data = store();
        for step in 0..=60 {
            sample(&mut data, t + step * 60, step as f64 / 10.0, reset);
        }
        sample(&mut data, t + LOOKBACK + 30, 6.5, reset);
        assert!(data.windows[0]
            .points
            .iter()
            .all(|point| point.at >= t + 30));
        assert!(data.windows[0].points.len() <= MAX_POINTS);
        assert!(valid_store(&data));
    }
    #[test]
    fn missing_malformed_or_changed_identity_drops_values_and_cannot_mix_accounts() {
        let (mut data, at) = steady();
        let other = "b".repeat(64);
        observe_into(
            &mut data,
            Some(&other),
            &limits(at + 300, 80.0, start() + 6 * 3600),
            at + 300,
        );
        assert_eq!(data.updated_at, Some(at));
        let mut invalid = limits(at + 300, 75.0, start() + 6 * 3600);
        invalid.session.as_mut().unwrap().remaining_percent = 99.0;
        observe_into(&mut data, Some(&identity()), &invalid, at + 300);
        assert!(data.windows.is_empty());
        assert_eq!(project(&data, now(at + 300)).status, "unavailable");
    }
    #[test]
    fn deadline_risk_distinguishes_before_near_and_after_reset_and_counts_down_with_time() {
        let (mut data, at) = steady();
        data.windows[0].resets_at = at + 30 * 60;
        assert_eq!(project(&data, now(at)).windows[0].risk, "after_reset");
        data.windows[0].resets_at = at + 130 * 60;
        assert_eq!(project(&data, now(at)).windows[0].risk, "near_reset");
        data.windows[0].resets_at = at + 6 * 3600;
        let first = project(&data, now(at));
        let later = project(&data, now(at + 120));
        assert!(
            (first.windows[0].eta_lower_minutes.unwrap()
                - later.windows[0].eta_lower_minutes.unwrap()
                - 2.0)
                .abs()
                < 0.001
        );
    }
    #[test]
    fn zero_official_remaining_is_exhaustion_not_sampling_and_empty_is_not_zero() {
        let mut data = store();
        let t = start();
        sample(&mut data, t, 100.0, t + 300);
        let result = project(&data, now(t));
        assert_eq!(result.status, "exhausted");
        assert_eq!(result.windows[0].eta_lower_minutes, Some(0.0));
        let absent = project(&Store::default(), now(t));
        assert_eq!(absent.status, "unavailable");
        assert!(absent.windows[0].remaining_percent.is_none());
    }
    #[test]
    fn identity_survives_token_refresh_but_separates_users_workspaces_and_sources() {
        let auth = CodexAuth {
            access_token: "never-persist-access-a".into(),
            account_id: Some("workspace-a".into()),
            user_id: Some("user-a".into()),
            is_chatgpt: true,
        };
        let environment = CodexEnvironment {
            home: PathBuf::from("source-a"),
            runtime: CodexRuntime::Native,
        };
        let first = stable_identity(&auth, &environment).unwrap();
        let mut changed = auth.clone();
        changed.access_token = "never-persist-access-b".into();
        assert_eq!(stable_identity(&changed, &environment).unwrap(), first);
        changed.user_id = Some("user-b".into());
        assert_ne!(stable_identity(&changed, &environment).unwrap(), first);
        changed = auth.clone();
        changed.account_id = Some("workspace-b".into());
        assert_ne!(stable_identity(&changed, &environment).unwrap(), first);
        let other = CodexEnvironment {
            home: PathBuf::from("source-b"),
            runtime: CodexRuntime::Native,
        };
        assert_ne!(stable_identity(&auth, &other).unwrap(), first);
        changed = auth.clone();
        changed.user_id = None;
        assert!(stable_identity(&changed, &environment).is_none());
        changed = auth;
        changed.is_chatgpt = false;
        assert!(stable_identity(&changed, &environment).is_none());
    }
    #[test]
    fn stable_access_claim_subject_can_identify_a_user_without_persisting_rotating_credentials() {
        let payload =
            URL_SAFE_NO_PAD.encode(serde_json::json!({"sub":"stable-subject"}).to_string());
        let mut auth = CodexAuth {
            access_token: format!("e30.{payload}.signature-a"),
            account_id: Some("workspace".into()),
            user_id: None,
            is_chatgpt: true,
        };
        let environment = CodexEnvironment {
            home: PathBuf::from("source"),
            runtime: CodexRuntime::Native,
        };
        let key = stable_identity(&auth, &environment).unwrap();
        auth.access_token = format!("e30.{payload}.signature-b");
        assert_eq!(stable_identity(&auth, &environment).unwrap(), key);
        assert!(!key.contains("stable-subject"));
        assert!(!key.contains("signature"));
    }
    #[test]
    fn desktop_identity_watch_invalidates_old_predictions_without_network_and_ignores_same_account()
    {
        let (mut data, at) = steady();
        let same = identity();
        assert!(!reconcile_store(
            &mut data,
            Some(same),
            "identity_unavailable"
        ));
        assert_eq!(project(&data, now(at)).status, "forecast");
        assert!(reconcile_store(
            &mut data,
            Some("b".repeat(64)),
            "identity_unavailable"
        ));
        assert!(data.windows.is_empty());
        assert_eq!(project(&data, now(at)).status, "unavailable");
        assert!(reconcile_store(&mut data, None, "api_key"));
        assert_eq!(data.reason.as_deref(), Some("api_key"));
        assert!(!reconcile_store(&mut data, None, "api_key"));
    }
    #[test]
    fn persistence_is_bounded_reprojected_and_read_only_for_unknown_directories() {
        let directory = std::env::temp_dir().join(format!("pace-{}", uuid::Uuid::new_v4()));
        let (data, at) = steady();
        let missing = read_snapshot(&directory, now(at));
        assert_eq!(missing.status, "unavailable");
        assert!(!directory.exists());
        fs::create_dir(&directory).unwrap();
        write_store(&directory, &data).unwrap();
        let snapshot = read_snapshot(&directory, now(at));
        let text = serde_json::to_string(&snapshot).unwrap();
        assert!(!text.contains(&identity()));
        assert!(!text.contains("identityHash"));
        assert!(!text.contains("access"));
        let mut corrupt = serde_json::to_value(&data).unwrap();
        corrupt["account"] = serde_json::json!("private-extra-field");
        fs::write(
            directory.join(FILE_NAME),
            serde_json::to_vec(&corrupt).unwrap(),
        )
        .unwrap();
        assert!(!serde_json::to_string(&read_snapshot(&directory, now(at)))
            .unwrap()
            .contains("private-extra-field"));
        fs::write(
            directory.join(FILE_NAME),
            vec![b' '; MAX_BYTES as usize + 1],
        )
        .unwrap();
        assert_eq!(read_snapshot(&directory, now(at)).status, "unavailable");
        fs::remove_file(directory.join(FILE_NAME)).unwrap();
        fs::remove_dir(directory).unwrap();
    }
    #[test]
    fn corrupt_nonmonotonic_disk_series_and_unknown_schema_are_not_trusted() {
        let (mut data, _) = steady();
        assert!(valid_store(&data));
        data.windows[0].points[2].used = 0.0;
        assert!(!valid_store(&data));
        let (mut data, _) = steady();
        data.schema_version = 2;
        assert!(!valid_store(&data));
        let (mut data, _) = steady();
        data.windows.push(data.windows[0].clone());
        assert!(!valid_store(&data));
        let (mut data, _) = steady();
        data.windows[0].points[0].at = i64::MIN;
        assert!(!valid_store(&data));
        let (mut data, _) = steady();
        data.reason = Some("private-value-must-not-export".into());
        assert!(!valid_store(&data));
    }
}
