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
    let (pace, (failed, wait, queued, in_flight)) = crate::quota_scope::with_live(|_| {
        let pace = crate::pulse_pace::read_snapshot(directory, now);
        let gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
        (
            pace,
            (
                gate.failed,
                gate.wait_seconds(Instant::now()),
                gate.queued,
                gate.in_flight(),
            ),
        )
    });
    let extras = crate::pulse_coach::extras(directory, &pace, now);
    let mut value = serde_json::to_value(pace).map_err(|_| "Could not read usage pace")?;
    value["coachExtras"] =
        serde_json::to_value(extras).map_err(|_| "Could not read coach context")?;
    value["localUsage"] = local_usage(widget.as_ref().and_then(|data| data.get("localUsage")), now);
    value["refreshFailed"] = json!(failed);
    value["refreshAfterSeconds"] = json!(wait);
    value["refreshQueued"] = json!(queued);
    value["refreshInFlight"] = json!(in_flight);
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
    tauri::async_runtime::spawn_blocking(move || {
        let identity_changed = crate::pulse_pace::reconcile_current_identity();
        let (poll, changed) = crate::quota_scope::with_observable(|_| {
            POLL_GATE
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .request(Instant::now())
        })
        .unwrap_or((None, false));
        let result = presentation(&directory, data);
        if changed || identity_changed {
            let _ = app.emit("pulse-pace-updated", ());
        }
        if let Some(poll) = poll {
            tauri::async_runtime::spawn_blocking(move || run_observation(&app, poll));
        }
        result
    })
    .await
    .map_err(|_| "Usage pace refresh did not complete".to_string())?
}

#[derive(Clone, Copy, Debug)]
struct PollLease {
    scope: u64,
    started_at: Instant,
    outcome_before: u64,
}

#[derive(Debug)]
struct PollGate {
    next: Instant,
    failures: u32,
    poll_started_at: Option<Instant>,
    account_generation: Option<u64>,
    queued: bool,
    scope: u64,
    failed: bool,
    outcome_revision: u64,
}
impl PollGate {
    fn new(now: Instant) -> Self {
        Self {
            next: now,
            failures: 0,
            poll_started_at: None,
            account_generation: None,
            queued: false,
            scope: 0,
            failed: false,
            outcome_revision: 0,
        }
    }
    fn in_flight(&self) -> bool {
        self.poll_started_at.is_some() || self.account_generation.is_some()
    }
    fn due(&self, now: Instant) -> bool {
        !self.in_flight() && now >= self.next
    }
    fn start(&mut self, now: Instant) -> Option<PollLease> {
        if !self.due(now) {
            return None;
        }
        self.queued = false;
        self.poll_started_at = Some(now);
        self.next = now + Duration::from_secs(60);
        Some(PollLease {
            scope: self.scope,
            started_at: now,
            outcome_before: self.outcome_revision,
        })
    }
    fn request(&mut self, now: Instant) -> (Option<PollLease>, bool) {
        if self.in_flight() || self.queued {
            return (None, false);
        }
        let poll = self.start(now);
        self.queued = poll.is_none();
        (poll, true)
    }
    fn start_scheduled(
        &mut self,
        now: Instant,
        scope: u64,
        has_display_or_recording: bool,
    ) -> Option<PollLease> {
        if self.scope != scope || !(self.queued || has_display_or_recording) {
            return None;
        }
        self.start(now)
    }
    fn start_account(&mut self, scope: u64, generation: u64) -> bool {
        if self.scope != scope
            || self
                .account_generation
                .is_some_and(|active| active >= generation)
        {
            return false;
        }
        self.account_generation = Some(generation);
        self.queued = false;
        true
    }
    fn release_account(&mut self, scope: u64, generation: u64) -> bool {
        if self.scope == scope && self.account_generation == Some(generation) {
            self.account_generation = None;
            return true;
        }
        false
    }
    /// An accepted account completion updates all entries, but does not own the poll lease.
    fn finish(&mut self, now: Instant, error: Option<&str>) {
        self.outcome_revision = self.outcome_revision.wrapping_add(1);
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
        self.next = self.next.max(now + Duration::from_secs(delay));
    }
    fn release(&mut self, now: Instant) {
        self.poll_started_at = None;
        self.next = self.next.max(now + Duration::from_secs(60));
    }
    fn complete(&mut self, now: Instant, lease: PollLease, error: Option<&str>) -> bool {
        if self.scope != lease.scope || self.poll_started_at != Some(lease.started_at) {
            return false;
        }
        // Errors before a flight exists still need a visible outcome. Never
        // count an already-published failure twice or overwrite a newer result.
        if self.outcome_revision == lease.outcome_before {
            if let Some(error) = error.filter(|error| *error != "identityChanged") {
                self.finish(now, Some(error));
            }
        }
        self.release(now);
        true
    }
    fn invalidate(&mut self, scope: u64) {
        self.scope = scope;
        self.queued = false;
        self.poll_started_at = None;
        self.account_generation = None;
        self.failed = false;
        self.failures = 0;
        self.outcome_revision = self.outcome_revision.wrapping_add(1);
    }
    fn wait_seconds(&self, now: Instant) -> u64 {
        let wait = self.next.saturating_duration_since(now);
        wait.as_secs()
            .saturating_add(u64::from(wait.subsec_nanos() > 0))
    }
}
static POLL_GATE: LazyLock<Mutex<PollGate>> =
    LazyLock::new(|| Mutex::new(PollGate::new(Instant::now())));
pub(crate) fn invalidate_scope(scope: u64) {
    let mut gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
    gate.invalidate(scope);
}
pub(crate) fn refresh_failed() -> bool {
    POLL_GATE.lock().unwrap_or_else(|error| error.into_inner()).failed
}
/// Store/cache are already committed; release this lock before emitting update events.
pub(crate) fn account_observation_finished(error: Option<&str>) {
    POLL_GATE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .finish(Instant::now(), error);
}
pub(crate) fn account_observation_started(scope: u64, generation: u64) -> bool {
    POLL_GATE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .start_account(scope, generation)
}
pub(crate) fn account_observation_released(scope: u64, generation: u64) -> bool {
    POLL_GATE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .release_account(scope, generation)
}
fn run_observation(app: &tauri::AppHandle, poll: PollLease) {
    let result = crate::codex_limits::fetch_codex_limits_for_scope(poll.scope);
    // Only the shared owner commits an outcome. A retired or delayed caller must
    // not mark a newer account observation failed when releasing its own lease.
    let completed = POLL_GATE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .complete(
            Instant::now(),
            poll,
            result.as_ref().err().map(String::as_str),
        );
    if completed {
        let _ = app.emit("pulse-pace-updated", ());
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
fn needs_observations(titlebar: bool, widget: bool, main: bool, recording: bool) -> bool {
    titlebar || widget || main || recording
}

/// All new pace refreshes share one cooldown. Identity checks never make a network request.
pub fn start_sampler(app: tauri::AppHandle) {
    POLL_GATE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .next = Instant::now() + Duration::from_secs(60);
    std::thread::spawn(move || {
        let mut visibility = VisibilityProbe::new(Instant::now());
        loop {
            std::thread::sleep(Duration::from_secs(5));
            // Retry local writes without adding an authenticated request or bypassing cooldown.
            if crate::quota_history::retry_pending().unwrap_or(false) {
                let _ = app.emit("quota-history-updated", ());
            }
            if std::env::var("PULSE_OFFLINE").as_deref() == Ok("1") {
                continue;
            }
            if crate::pulse_pace::reconcile_current_identity() {
                let _ = app.emit("pulse-pace-updated", ());
            }
            let (due, queued, observed_scope) = {
                let gate = POLL_GATE.lock().unwrap_or_else(|error| error.into_inner());
                (gate.due(Instant::now()), gate.queued, gate.scope)
            };
            if !due {
                continue;
            }
            let has_display_or_recording = !queued && {
                let (titlebar, widget) = app
                    .state::<crate::pulse_desktop::PreferenceStore>()
                    .value
                    .lock()
                    .map(|preferences| (preferences.titlebar_enabled, preferences.widget_visible))
                    .unwrap_or((false, false));
                // Query native visibility only for routine sampling when no
                // companion already requires it.
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
                needs_observations(
                    titlebar,
                    widget,
                    main,
                    crate::quota_history::recording_enabled(),
                )
            };
            let poll = crate::quota_scope::with_observable(|scope| {
                if scope != observed_scope {
                    return None;
                }
                POLL_GATE
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .start_scheduled(Instant::now(), scope, has_display_or_recording)
            })
            .flatten();
            if let Some(poll) = poll {
                let _ = app.emit("pulse-pace-updated", ());
                run_observation(&app, poll);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn visible_main_or_widget_keeps_sampling_when_titlebar_is_disabled() {
        assert!(needs_observations(false, false, true, false));
        assert!(needs_observations(false, true, false, false));
        assert!(needs_observations(true, false, false, false));
        assert!(!needs_observations(false, false, false, false));
    }
    #[test]
    fn recording_continues_with_all_windows_hidden_and_disabled_recording_still_respects_display_demand() {
        assert!(needs_observations(false, false, false, true));
        assert!(!needs_observations(false, false, false, false));
        assert!(needs_observations(false, true, false, false));
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
        assert!(gate.start(now).is_some());
        assert!(gate.start(now + Duration::from_secs(120)).is_none());
        gate.finish(now, None);
        gate.release(now);
        assert!(gate.start(now + Duration::from_secs(59)).is_none());
        assert!(gate.start(now + Duration::from_secs(60)).is_some());
    }
    #[test]
    fn rate_limits_keep_the_deadline_then_success_recovers_normal_cadence() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.finish(now, Some("quota response 429"));
        assert!(gate.failed);
        assert!(gate.start(now + Duration::from_secs(299)).is_none());
        assert!(gate.start(now + Duration::from_secs(300)).is_some());
        for _ in 0..10 {
            gate.finish(now, Some("service unavailable"));
        }
        assert_eq!(gate.next.duration_since(now), Duration::from_secs(900));
        gate.finish(now, None);
        assert!(!gate.failed);
        assert_eq!(gate.failures, 0);
        assert_eq!(gate.next.duration_since(now), Duration::from_secs(900));
        gate.release(now);
        let later = now + Duration::from_secs(900);
        assert!(gate.start(later).is_some());
        gate.finish(later, None);
        gate.release(later);
        assert_eq!(gate.next.duration_since(later), Duration::from_secs(60));
    }
    #[test]
    fn quota_refresh_independent_success_keeps_existing_rate_limit_deadline() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.finish(now, Some("quota response 429"));
        let deadline = gate.next;
        gate.finish(now + Duration::from_secs(5), None);
        assert!(
            !gate.failed,
            "New accepted quota data clears the old failure"
        );
        assert_eq!(gate.failures, 0);
        assert_eq!(
            gate.next, deadline,
            "A success must not shorten the 429 cooldown"
        );
    }
    #[test]
    fn quota_refresh_published_success_does_not_release_a_running_pace_read() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        assert!(gate.start(now).is_some());
        gate.finish(now + Duration::from_secs(1), None);
        assert!(
            gate.in_flight(),
            "Publication and poll ownership are separate"
        );
        assert!(gate.start(now + Duration::from_secs(300)).is_none());
        gate.release(now + Duration::from_secs(1));
        assert!(!gate.in_flight());
        assert!(gate.start(now + Duration::from_secs(61)).is_some());
    }
    #[test]
    fn quota_refresh_true_failure_keeps_backoff_after_a_late_poll_release() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        assert!(gate.start(now).is_some());
        gate.finish(now + Duration::from_secs(5), Some("synthetic timeout"));
        assert!(gate.failed);
        assert_eq!(gate.next.duration_since(now), Duration::from_secs(125));
        gate.release(now + Duration::from_secs(6));
        assert!(gate.failed);
        assert!(gate.start(now + Duration::from_secs(124)).is_none());
        assert!(gate.start(now + Duration::from_secs(125)).is_some());
    }
    #[test]
    fn quota_refresh_unpublished_local_error_is_visible_but_cannot_overwrite_recovery() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        let poll = gate.start(now).unwrap();
        gate.complete(
            now + Duration::from_secs(5),
            poll,
            Some("synthetic local lock error"),
        );
        assert!(gate.failed);
        let failed_deadline = gate.next;
        gate.finish(now + Duration::from_secs(6), None);
        gate.complete(
            now + Duration::from_secs(7),
            poll,
            Some("older local error"),
        );
        assert!(!gate.failed);
        assert_eq!(gate.next, failed_deadline);
    }
    #[test]
    fn quota_refresh_a_published_failure_is_not_backed_off_twice() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        let poll = gate.start(now).unwrap();
        gate.finish(now + Duration::from_secs(5), Some("synthetic timeout"));
        let deadline = gate.next;
        gate.complete(
            now + Duration::from_secs(6),
            poll,
            Some("synthetic timeout"),
        );
        assert_eq!(gate.failures, 1);
        assert_eq!(gate.next, deadline);
    }
    #[test]
    fn quota_refresh_old_scope_or_retired_completion_cannot_fail_the_new_scope() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        let poll = gate.start(now).unwrap();
        gate.invalidate(1);
        assert!(!gate.complete(
            now + Duration::from_secs(1),
            poll,
            Some("old scope local error"),
        ));
        assert!(!gate.failed);
        let current_time = now + Duration::from_secs(60);
        let current = gate.start(current_time).unwrap();
        assert!(!gate.complete(current_time, poll, Some("retired")));
        assert!(gate.in_flight());
        gate.complete(
            current_time + Duration::from_secs(2),
            current,
            Some("identityChanged"),
        );
        assert!(!gate.failed);
        assert_eq!(gate.failures, 0);
    }

    #[test]
    fn a_cooldown_click_is_consumed_once_at_the_backoff_deadline() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.finish(now, Some("synthetic 429"));
        let (poll, changed) = gate.request(now + Duration::from_secs(1));
        assert!(poll.is_none() && changed && gate.queued);
        assert_eq!(gate.wait_seconds(now + Duration::from_secs(1)), 299);
        assert!(!gate.request(now + Duration::from_secs(2)).1);
        assert!(gate.start(now + Duration::from_secs(299)).is_none() && gate.queued);

        let due = now + Duration::from_secs(300);
        let poll = gate.start(due).unwrap();
        assert!(!gate.queued && gate.in_flight());
        assert!(!gate.request(due).1);
        gate.complete(due, poll, Some("synthetic timeout"));
        assert!(gate.failed && !gate.queued && !gate.in_flight());
        assert_eq!(gate.wait_seconds(due), 240);
        assert!(!gate.due(due + Duration::from_secs(239)));
    }

    #[test]
    fn an_existing_account_query_fulfills_pending_intent_and_repeated_clicks_share_it() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.invalidate(4);
        gate.finish(now, None);
        assert!(gate.request(now).1 && gate.queued);
        assert!(gate.start_account(4, 11));
        assert!(gate.in_flight() && !gate.queued);
        assert!(!gate.request(now + Duration::from_secs(60)).1);
        assert!(!gate.release_account(4, 10));
        gate.finish(now + Duration::from_secs(8), None);
        assert!(gate.release_account(4, 11));
        assert!(!gate.queued && !gate.in_flight());
        assert!(!gate.due(now + Duration::from_secs(67)));
    }

    #[test]
    fn a_new_scope_drops_the_old_queue_and_rejects_retired_account_leases() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.invalidate(7);
        gate.finish(now, None);
        assert!(gate.request(now).1 && gate.queued);
        gate.invalidate(8);
        assert!(!gate.queued);
        assert!(!gate.start_account(7, 12));
        assert!(gate.start_account(8, 13));
        assert!(!gate.release_account(7, 12));
        assert!(gate.in_flight());
        assert!(gate.release_account(8, 13));
        assert!(!gate.in_flight());
    }

    #[test]
    fn automatic_sampling_still_requires_demand_but_an_explicit_queue_can_finish_hidden() {
        let now = Instant::now();
        let mut gate = PollGate::new(now);
        gate.invalidate(1);
        assert!(gate.start_scheduled(now, 1, false).is_none());
        gate.finish(now, None);
        assert!(gate.request(now).1);
        assert!(gate
            .start_scheduled(now + Duration::from_secs(60), 2, true)
            .is_none());
        assert!(gate.queued);
        assert!(gate
            .start_scheduled(now + Duration::from_secs(60), 1, false)
            .is_some());
        assert!(!gate.queued);
    }
}
