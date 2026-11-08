//! Native-only presentation. Account pace and local token attribution remain separate.
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

fn local_usage(value: Option<&Value>, now: DateTime<Utc>) -> Value {
    let Some(value) = value else {
        return Value::Null;
    };
    let timezone = value["timezone"]
        .as_str()
        .and_then(|text| text.parse::<chrono_tz::Tz>().ok());
    let date = value["date"]
        .as_str()
        .and_then(|text| NaiveDate::parse_from_str(text, "%Y-%m-%d").ok());
    if !timezone
        .zip(date)
        .is_some_and(|(zone, day)| now.with_timezone(&zone).date_naive() == day)
    {
        return Value::Null;
    }
    let Some(total) = value["totalTokens"]
        .as_u64()
        .filter(|number| *number <= 9_007_199_254_740_991)
    else {
        return Value::Null;
    };
    let updated = value["updatedAt"]
        .as_str()
        .and_then(|text| DateTime::parse_from_rfc3339(text).ok())
        .map(|date| date.with_timezone(&Utc));
    let stale = value["stale"].as_bool().unwrap_or(true)
        || updated.is_none_or(|date| {
            !(-120..=360).contains(&now.signed_duration_since(date).num_seconds())
        });
    let rows = |key: &str| -> Vec<Value> {
        value[key].as_array().into_iter().flatten().take(24).filter_map(|row| {
            let label = row["label"].as_str()?.chars().filter(|character| !character.is_control()).take(96).collect::<String>();
            let tokens = row["totalTokens"].as_u64().filter(|tokens| *tokens > 0 && *tokens <= total)?;
            if label.trim().is_empty() { return None; }
            Some(json!({"label":label,"totalTokens":tokens,"sharePercent":tokens as f64 / total as f64 * 100.0}))
        }).take(3).collect()
    };
    json!({"date":date.map(|date| date.to_string()),"timezone":timezone.map(|zone| zone.name()),
        "updatedAt":updated.map(|date| date.to_rfc3339()),"stale":stale,"totalTokens":total,
        "projects":rows("projects"),"models":rows("models")})
}

fn presentation(directory: &Path, widget: Option<Value>) -> Result<Value, String> {
    let now = Utc::now();
    let pace = crate::pulse_pace::read_snapshot(directory, now);
    let extras = crate::pulse_coach::extras(directory, &pace, now);
    let mut value = serde_json::to_value(pace).map_err(|_| "Could not read usage pace")?;
    value["coachExtras"] =
        serde_json::to_value(extras).map_err(|_| "Could not read coach context")?;
    value["localUsage"] = local_usage(widget.as_ref().and_then(|data| data.get("localUsage")), now);
    let gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
    value["refreshFailed"] = json!(gate.failed);
    value["refreshAfterSeconds"] = json!(gate.wait_seconds(Instant::now()));
    Ok(value)
}

#[tauri::command]
pub fn fetch_pulse_pace(
    paths: tauri::State<'_, crate::pulse_desktop::PulsePaths>,
    widget: tauri::State<'_, crate::pulse_desktop::WidgetSnapshot>,
) -> Result<Value, String> {
    let data = widget
        .0
        .lock()
        .map_err(|_| "Local usage is unavailable")?
        .clone();
    presentation(&paths.data, data)
}

#[tauri::command]
pub async fn refresh_pulse_pace(
    paths: tauri::State<'_, crate::pulse_desktop::PulsePaths>,
    widget: tauri::State<'_, crate::pulse_desktop::WidgetSnapshot>,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    let data = widget
        .0
        .lock()
        .map_err(|_| "Local usage is unavailable")?
        .clone();
    let directory = paths.data.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let response = guarded_observation();
        let mut value = presentation(&directory, data)?;
        // Returning stale/unknown readings retains context without exposing service errors.
        value["refreshFailed"] = json!(response.failed);
        value["refreshAfterSeconds"] = json!(response.wait_seconds);
        Ok(value)
    })
    .await
    .map_err(|_| "Usage pace refresh did not complete".to_string())?;
    let _ = app.emit("pulse-pace-updated", ());
    result
}

#[derive(Debug)]
struct PollGate {
    next: Instant,
    failures: u32,
    in_flight: bool,
    failed: bool,
}
impl PollGate {
    fn new(now: Instant) -> Self {
        Self {
            next: now,
            failures: 0,
            in_flight: false,
            failed: false,
        }
    }
    fn start(&mut self, now: Instant) -> bool {
        if self.in_flight || now < self.next {
            return false;
        }
        self.in_flight = true;
        self.next = now + Duration::from_secs(60);
        true
    }
    fn finish(&mut self, now: Instant, error: Option<&str>) {
        self.in_flight = false;
        self.failed = error.is_some();
        let delay = if let Some(error) = error {
            self.failures = (self.failures + 1).min(5);
            let ordinary = (60_u64 * (1_u64 << self.failures)).min(900);
            if error.contains("429") || error.to_ascii_lowercase().contains("rate limit") {
                ordinary.max(300)
            } else {
                ordinary
            }
        } else {
            self.failures = 0;
            60
        };
        self.next = now + Duration::from_secs(delay);
    }
    fn wait_seconds(&self, now: Instant) -> u64 {
        self.next
            .saturating_duration_since(now)
            .as_secs()
            .saturating_add(1)
    }
}
static POLL_GATE: LazyLock<Mutex<PollGate>> =
    LazyLock::new(|| Mutex::new(PollGate::new(Instant::now())));
struct PollOutcome {
    failed: bool,
    wait_seconds: u64,
}
fn guarded_observation() -> PollOutcome {
    {
        let mut gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
        if !gate.start(Instant::now()) {
            return PollOutcome {
                failed: gate.failed,
                wait_seconds: gate.wait_seconds(Instant::now()),
            };
        }
    }
    let result = crate::codex_limits::fetch_codex_limits();
    let mut gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
    gate.finish(Instant::now(), result.as_ref().err().map(String::as_str));
    PollOutcome {
        failed: gate.failed,
        wait_seconds: gate.wait_seconds(Instant::now()),
    }
}

struct VisibilityProbe {
    next: Instant,
    visible: bool,
}
impl VisibilityProbe {
    fn new(now: Instant) -> Self {
        Self {
            next: now,
            visible: false,
        }
    }
    fn visible(&mut self, now: Instant, query: impl FnOnce() -> bool) -> bool {
        if now >= self.next {
            self.visible = query();
            self.next = now + Duration::from_secs(30);
        }
        self.visible
    }
}
fn needs_observations(titlebar: bool, widget: bool, main: bool) -> bool {
    titlebar || widget || main
}

/// All new pace refreshes share one cooldown. Identity checks never make a network request.
pub fn start_sampler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        POLL_GATE
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .next = Instant::now() + Duration::from_secs(60);
        let mut visibility = VisibilityProbe::new(Instant::now());
        loop {
            std::thread::sleep(Duration::from_secs(5));
            if std::env::var("PULSE_OFFLINE").as_deref() == Ok("1") {
                continue;
            }
            if crate::pulse_pace::reconcile_current_identity() {
                let _ = app.emit("pulse-pace-updated", ());
            }
            let due = {
                let gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
                !gate.in_flight && Instant::now() >= gate.next
            };
            if !due {
                continue;
            }
            let (titlebar, widget) = app
                .state::<crate::pulse_desktop::PreferenceStore>()
                .value
                .lock()
                .map(|preferences| (preferences.titlebar_enabled, preferences.widget_visible))
                .unwrap_or((false, false));
            // Query native visibility only when sampling is due and no companion
            // needs it. Cache for 30s; this is never part of the native follow path.
            let main = if titlebar || widget {
                false
            } else {
                visibility.visible(Instant::now(), || {
                    app.get_webview_window("main").is_some_and(|window| {
                        window.is_visible().unwrap_or(false)
                            && !window.is_minimized().unwrap_or(true)
                    })
                })
            };
            if !needs_observations(titlebar, widget, main) {
                continue;
            }
            guarded_observation();
            let _ = app.emit("pulse-pace-updated", ());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn visible_main_or_widget_keeps_sampling_when_titlebar_is_disabled() {
        assert!(needs_observations(false, false, true));
        assert!(needs_observations(false, true, false));
        assert!(needs_observations(true, false, false));
        assert!(!needs_observations(false, false, false));
    }
    #[test]
    fn visibility_queries_are_cached_between_due_sampling_checks() {
        let at = Instant::now();
        let mut probe = VisibilityProbe::new(at);
        assert!(probe.visible(at, || true));
        assert!(probe.visible(at + Duration::from_secs(5), || panic!(
            "No repeated native getter"
        )));
        assert!(!probe.visible(at + Duration::from_secs(30), || false));
    }
    fn now() -> DateTime<Utc> {
        "2026-11-08T08:00:00Z".parse().unwrap()
    }
    fn source() -> Value {
        json!({"date":"2026-11-08","timezone":"Asia/Shanghai","updatedAt":"2026-11-08T07:59:00Z","stale":false,"totalTokens":1000,"account":"private","projects":[{"label":"Team / Demo","totalTokens":620,"sharePercent":99,"path":"private"}],"models":[{"label":"model","totalTokens":800}]})
    }
    #[test]
    fn local_sources_are_today_only_whitelisted_and_measured_against_local_tokens() {
        let output = local_usage(Some(&source()), now());
        assert_eq!(output["projects"][0]["sharePercent"], 62.0);
        assert_eq!(output["models"][0]["sharePercent"], 80.0);
        assert!(!output.to_string().contains("private"));
        assert_eq!(output["stale"], false);
        let mut value = source();
        value["date"] = json!("2026-11-07");
        assert!(local_usage(Some(&value), now()).is_null());
    }
    #[test]
    fn stale_unknown_zero_and_overcounted_rows_are_distinct() {
        assert!(local_usage(None, now()).is_null());
        let mut value = source();
        value["totalTokens"] = json!(0);
        let output = local_usage(Some(&value), now());
        assert_eq!(output["totalTokens"], 0);
        assert_eq!(output["projects"], json!([]));
        value = source();
        value["updatedAt"] = json!("2026-11-08T07:00:00Z");
        assert_eq!(local_usage(Some(&value), now())["stale"], true);
        value["projects"][0]["totalTokens"] = json!(1001);
        assert_eq!(local_usage(Some(&value), now())["projects"], json!([]));
    }
    #[test]
    fn manual_and_scheduled_refreshes_cannot_bypass_cooldown_or_in_flight_request() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        assert!(gate.start(now));
        assert!(!gate.start(now + Duration::from_secs(120)));
        gate.finish(now, None);
        assert!(!gate.start(now + Duration::from_secs(59)));
        assert!(gate.start(now + Duration::from_secs(60)));
    }
    #[test]
    fn rate_limits_wait_five_minutes_and_success_recovers_normal_cadence() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.finish(now, Some("quota response 429"));
        assert!(gate.failed);
        assert!(!gate.start(now + Duration::from_secs(299)));
        assert!(gate.start(now + Duration::from_secs(300)));
        for _ in 0..10 {
            gate.finish(now, Some("service unavailable"));
        }
        assert_eq!(gate.next.duration_since(now), Duration::from_secs(900));
        gate.finish(now, None);
        assert!(!gate.failed);
        assert_eq!(gate.failures, 0);
        assert_eq!(gate.next.duration_since(now), Duration::from_secs(60));
    }
}
