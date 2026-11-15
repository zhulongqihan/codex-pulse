use super::*;
use crate::types::CodexLimitWindow;
use std::path::PathBuf;

const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const RANGE: &str = "custom:2026-01-01_2026-01-02";
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("quota-history-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn ledger(&self) -> Ledger {
        Ledger::open(&self.0, "UTC").unwrap()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn limits(at: &str, used: f64) -> CodexLimitsResponse {
    CodexLimitsResponse {
        identity_revision: None,
        session: Some(CodexLimitWindow {
            used_percent: used,
            remaining_percent: 100.0 - used,
            window_minutes: Some(300),
            resets_at: Some("2026-01-03T00:00:00Z".into()),
        }),
        weekly: None,
        credits: None,
        credits_is_mock: false,
        reset_credits_available_count: None,
        reset_credits: None,
        updated_at: at.into(),
        source: "oauth".into(),
        account: None,
        membership_level: None,
        workspace_name: None,
        subscription_expires_at: None,
        subscription_will_renew: None,
    }
}
fn observe(ledger: &mut Ledger, at: &str, used: f64) {
    ledger.observe(Some(A), &limits(at, used)).unwrap();
}
fn total(ledger: &Ledger) -> Option<f64> {
    ledger
        .query(Some(A), RANGE)
        .unwrap()
        .summaries
        .first()
        .and_then(|v| v.consumed_percent_points)
}

#[test]
fn same_day_remaining_80_to_72_records_eight_points_in_real_sqlite() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
    assert_eq!(total(&ledger), Some(8.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].covered_minutes,
        1.0
    );
    let count: i64 = ledger
        .connection
        .query_row("SELECT COUNT(*) FROM segments", [], |r| r.get(0))
        .unwrap();
    assert!(count > 0);
}

fn reset_limits(at: &str, used: f64, reset: &str) -> CodexLimitsResponse {
    let mut response = limits(at, used);
    response.session.as_mut().unwrap().resets_at = Some(reset.into());
    response
}

#[test]
fn reset_jitter_preserves_known_consumption_and_coverage_for_both_window_kinds() {
    for kind in ["session", "weekly"] {
        let dir = Temp::new();
        let mut ledger = dir.ledger();
        for (at, used, reset) in [
            ("2026-01-01T10:00:00Z", 20.0, "2026-01-03T00:00:00Z"),
            ("2026-01-01T10:01:00Z", 28.0, "2026-01-03T00:00:01Z"),
        ] {
            let mut response = reset_limits(at, used, reset);
            if kind == "weekly" {
                let mut window = response.session.take().unwrap();
                window.window_minutes = Some(10080);
                response.weekly = Some(window);
            }
            ledger.observe(Some(A), &response).unwrap();
        }
        let result = ledger.query(Some(A), RANGE).unwrap();
        assert_eq!(result.daily[0].kind, kind);
        assert_eq!(result.daily[0].consumed_percent_points, Some(8.0));
        assert_eq!(result.daily[0].covered_minutes, 1.0);
        assert_eq!(result.daily[0].cycle_count, 1);
        assert!(ledger
            .export_segments(Some(A), RANGE)
            .unwrap()
            .iter()
            .all(|s| s.resets_at == "2026-01-03T00:00:00.000Z"));
    }
}

#[test]
fn reset_jitter_unchanged_readings_keep_the_persisted_anchor_through_restarts() {
    let dir = Temp::new();
    for (at, reset) in [
        ("2026-01-01T10:00:00Z", "2026-01-03T00:00:00Z"),
        ("2026-01-01T10:01:00Z", "2026-01-03T00:00:01Z"),
        ("2026-01-01T10:02:00Z", "2026-01-02T23:59:59Z"),
        ("2026-01-01T10:03:00Z", "2026-01-03T00:00:02Z"),
        ("2026-01-01T10:04:00Z", "2026-01-02T23:59:58Z"),
    ] {
        let mut ledger = dir.ledger();
        ledger
            .observe(Some(A), &reset_limits(at, 20.0, reset))
            .unwrap();
    }
    let ledger = dir.ledger();
    let result = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(result.daily[0].consumed_percent_points, Some(0.0));
    assert_eq!(result.daily[0].status, "unchanged");
    assert_eq!(result.daily[0].cycle_count, 1);
    assert_eq!(result.daily[0].sample_count, 5);
    assert_eq!(result.daily[0].covered_minutes, 4.0);
    let segments = ledger.export_segments(Some(A), RANGE).unwrap();
    assert_eq!(segments.len(), 2);
    assert!(segments
        .iter()
        .all(|s| s.resets_at == "2026-01-03T00:00:00.000Z"));
}

#[test]
fn reset_jitter_cannot_accumulate_into_unbounded_drift() {
    let dir = Temp::new();
    for (at, used, reset) in [
        ("2026-01-01T10:00:00Z", 20.0, "2026-01-03T00:00:00Z"),
        ("2026-01-01T10:01:00Z", 21.0, "2026-01-03T00:00:01Z"),
        ("2026-01-01T10:02:00Z", 22.0, "2026-01-03T00:00:02Z"),
        ("2026-01-01T10:03:00Z", 30.0, "2026-01-03T00:00:03Z"),
    ] {
        let mut ledger = dir.ledger();
        ledger
            .observe(Some(A), &reset_limits(at, used, reset))
            .unwrap();
    }
    let ledger = dir.ledger();
    let result = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(result.daily[0].consumed_percent_points, Some(2.0));
    assert_eq!(result.daily[0].cycle_count, 2);
    assert_eq!(result.daily[0].covered_minutes, 2.0);
    let segments = ledger.export_segments(Some(A), RANGE).unwrap();
    let last = segments.last().unwrap();
    assert_eq!(last.reason, "cycle_changed");
    assert_eq!(last.resets_at, "2026-01-03T00:00:03.000Z");
    assert_eq!(last.consumed_percent_points, None);
}

#[test]
fn reset_jitter_duplicates_do_not_conflict_but_used_conflicts_keep_the_first_reading() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    assert!(!ledger
        .observe(
            Some(A),
            &reset_limits("2026-01-01T10:00:00Z", 20.0, "2026-01-03T00:00:01Z",)
        )
        .unwrap());
    ledger
        .observe(
            Some(A),
            &reset_limits("2026-01-01T10:01:00Z", 28.0, "2026-01-02T23:59:59Z"),
        )
        .unwrap();
    assert!(!ledger
        .observe(
            Some(A),
            &reset_limits("2026-01-01T10:01:00Z", 28.0, "2026-01-03T00:00:01Z",)
        )
        .unwrap());
    assert!(ledger
        .observe(
            Some(A),
            &reset_limits("2026-01-01T10:01:00Z", 80.0, "2026-01-03T00:00:01Z",)
        )
        .unwrap());
    observe(&mut ledger, "2026-01-01T10:02:00Z", 30.0);
    let result = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(result.daily[0].consumed_percent_points, Some(10.0));
    assert_eq!(result.daily[0].sample_count, 3);
    assert_eq!(result.daily[0].cycle_count, 1);
    assert_eq!(result.daily[0].gap_count, 1);
    assert_eq!(
        ledger
            .export_segments(Some(A), RANGE)
            .unwrap()
            .iter()
            .filter(|s| s.reason == "conflict")
            .count(),
        1
    );
}

#[test]
fn reset_jitter_after_the_old_reset_expires_does_not_bridge_cycles() {
    for at in ["2026-01-01T10:00:00Z", "2026-01-01T10:00:00.500Z"] {
        let dir = Temp::new();
        let mut ledger = dir.ledger();
        ledger
            .observe(
                Some(A),
                &reset_limits("2026-01-01T09:59:00Z", 20.0, "2026-01-01T10:00:00Z"),
            )
            .unwrap();
        ledger
            .observe(Some(A), &reset_limits(at, 28.0, "2026-01-01T10:00:01Z"))
            .unwrap();
        let result = ledger.query(Some(A), RANGE).unwrap();
        assert_eq!(result.daily[0].consumed_percent_points, None);
        assert_eq!(result.daily[0].covered_minutes, 0.0);
        assert_eq!(result.daily[0].cycle_count, 2);
        assert_eq!(
            ledger
                .export_segments(Some(A), RANGE)
                .unwrap()
                .last()
                .unwrap()
                .reason,
            "cycle_changed"
        );
    }
}

#[test]
fn reset_jitter_does_not_hide_counter_decreases_or_recording_epochs() {
    for resumed in [false, true] {
        let dir = Temp::new();
        let mut ledger = dir.ledger();
        observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
        observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
        if resumed {
            ledger.set_enabled(false).unwrap();
            ledger.set_enabled(true).unwrap();
        }
        ledger
            .observe(
                Some(A),
                &reset_limits(
                    "2026-01-01T10:02:00Z",
                    if resumed { 60.0 } else { 10.0 },
                    "2026-01-03T00:00:01Z",
                ),
            )
            .unwrap();
        ledger
            .observe(
                Some(A),
                &reset_limits(
                    "2026-01-01T10:03:00Z",
                    if resumed { 62.0 } else { 12.0 },
                    "2026-01-02T23:59:59Z",
                ),
            )
            .unwrap();
        let result = ledger.query(Some(A), RANGE).unwrap();
        assert_eq!(result.daily[0].consumed_percent_points, Some(10.0));
        assert_eq!(result.daily[0].covered_minutes, 2.0);
        assert_eq!(result.daily[0].cycle_count, 1);
        let segments = ledger.export_segments(Some(A), RANGE).unwrap();
        assert_eq!(
            segments[2].reason,
            if resumed {
                "recording_resumed"
            } else {
                "counter_decreased"
            }
        );
        assert_eq!(segments[2].consumed_percent_points, None);
    }
}

#[test]
fn reset_jitter_preserves_same_day_gaps_and_unallocated_midnight_deltas() {
    for (start, end, cross_day) in [
        ("2026-01-01T10:00:00Z", "2026-01-01T12:01:00Z", false),
        ("2026-01-01T23:59:00Z", "2026-01-02T00:01:00Z", true),
    ] {
        let dir = Temp::new();
        let mut ledger = dir.ledger();
        observe(&mut ledger, start, 20.0);
        ledger
            .observe(Some(A), &reset_limits(end, 28.0, "2026-01-03T00:00:01Z"))
            .unwrap();
        let result = ledger.query(Some(A), RANGE).unwrap();
        assert!(result.daily.iter().all(|d| d.covered_minutes == 0.0));
        assert!(result.daily.iter().all(|d| d.cycle_count == 1));
        let segments = ledger.export_segments(Some(A), RANGE).unwrap();
        assert_eq!(segments[1].consumed_percent_points, Some(8.0));
        if cross_day {
            assert_eq!(result.unallocated_count, 1);
            assert!(result
                .daily
                .iter()
                .all(|d| d.consumed_percent_points.is_none()));
            assert_eq!(segments[1].reason, "cross_day");
            assert_eq!(segments[1].date, None);
        } else {
            assert_eq!(result.daily[0].consumed_percent_points, Some(8.0));
            assert_eq!(result.daily[0].gap_count, 1);
            assert_eq!(segments[1].reason, "same_day_gap");
        }
    }
}

#[test]
fn duplicate_out_of_order_and_same_millisecond_conflicts_never_double_count() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00.100Z", 20.0);
    for (at, used) in [
        ("2026-01-01T10:01:00.100Z", 28.0),
        ("2026-01-01T10:01:00.100Z", 28.0),
        ("2026-01-01T10:01:00.100Z", 80.0),
        ("2026-01-01T10:00:00.500Z", 90.0),
        ("2026-01-01T10:01:00.200Z", 30.0),
    ] {
        observe(&mut ledger, at, used);
    }
    assert_eq!(total(&ledger), Some(10.0));
}
#[test]
fn restart_resumes_durable_baseline_without_double_count() {
    let dir = Temp::new();
    {
        let mut ledger = dir.ledger();
        observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    }
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
    assert_eq!(total(&ledger), Some(8.0));
}
#[test]
fn same_day_long_gap_keeps_known_delta_without_claiming_coverage() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T12:01:00Z", 28.0);
    let response = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(response.daily.len(), 1);
    let row = &response.daily[0];
    assert_eq!(row.consumed_percent_points, Some(8.0));
    assert_eq!(row.covered_minutes, 0.0);
    assert_eq!(row.gap_count, 1);
}
#[test]
fn midnight_delta_stays_unallocated_and_does_not_become_daily_zero() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T23:59:00Z", 20.0);
    observe(&mut ledger, "2026-01-02T00:01:00Z", 28.0);
    let response = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(response.unallocated_count, 1);
    assert!(response
        .daily
        .iter()
        .all(|v| v.consumed_percent_points.is_none()));
    assert_eq!(response.daily.len(), 2);
}
#[test]
fn multiple_cycles_over_100_and_counter_drop_preserve_older_consumption() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    for (at, used) in [
        ("2026-01-01T01:00:00Z", 0.0),
        ("2026-01-01T01:01:00Z", 90.0),
        ("2026-01-01T02:00:00Z", 10.0),
        ("2026-01-01T02:01:00Z", 80.0),
    ] {
        observe(&mut ledger, at, used);
    }
    assert_eq!(total(&ledger), Some(160.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].cycle_count,
        1
    );
}
#[test]
fn one_sample_unknown_and_two_equal_samples_observed_zero_are_distinct() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    assert_eq!(ledger.query(Some(A), RANGE).unwrap().daily.len(), 1);
    assert_eq!(total(&ledger), None);
    observe(&mut ledger, "2026-01-01T10:01:00Z", 20.0);
    assert_eq!(total(&ledger), Some(0.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].status,
        "unchanged"
    );
}
#[test]
fn identities_and_real_window_lengths_never_mix() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
    ledger
        .observe(Some(B), &limits("2026-01-01T10:02:00Z", 60.0))
        .unwrap();
    let mut other = limits("2026-01-01T10:03:00Z", 50.0);
    other.session.as_mut().unwrap().window_minutes = Some(360);
    ledger.observe(Some(A), &other).unwrap();
    assert_eq!(total(&ledger), Some(8.0));
    assert_eq!(ledger.query(Some(A), RANGE).unwrap().summaries.len(), 2);
    assert_eq!(
        ledger.query(Some(B), RANGE).unwrap().daily[0].consumed_percent_points,
        None
    );
}
#[test]
fn unverified_identity_never_writes_account_history() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    ledger
        .observe(
            Some("token-fallback"),
            &limits("2026-01-01T10:00:00Z", 20.0),
        )
        .unwrap();
    let response = ledger.query(None, RANGE).unwrap();
    assert!(!response.scope_available);
    assert!(response.daily.is_empty());
}
#[test]
fn queries_bound_to_366_days_and_corrupt_database_never_replaced() {
    let dir = Temp::new();
    let ledger = dir.ledger();
    assert!(ledger.query(Some(A), "367d").is_err());
    drop(ledger);
    let bytes = b"invalid sqlite history must survive";
    std::fs::write(dir.0.join("quota-history.db"), bytes).unwrap();
    assert!(Ledger::open(&dir.0, "UTC").is_err());
    assert_eq!(
        std::fs::read(dir.0.join("quota-history.db")).unwrap(),
        bytes
    );
}

#[test]
fn recording_toggle_persists_epoch_and_does_not_bridge_disabled_time() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
    assert!(!ledger.set_enabled(false).unwrap().enabled);
    observe(&mut ledger, "2026-01-01T10:02:00Z", 50.0);
    drop(ledger);
    let mut ledger = Ledger::open(&dir.0, "Asia/Tokyo").unwrap();
    assert!(!ledger.get_preferences().enabled);
    assert_eq!(ledger.get_preferences().timezone, "UTC");
    assert!(ledger.set_enabled(true).unwrap().enabled);
    observe(&mut ledger, "2026-01-01T10:03:00Z", 60.0);
    observe(&mut ledger, "2026-01-01T10:04:00Z", 62.0);
    assert_eq!(total(&ledger), Some(10.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].covered_minutes,
        2.0
    );
}
#[test]
fn unknown_preferences_and_failed_atomic_save_preserve_authoritative_state() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    let path = dir.0.join(preferences::FILE);
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert!(ledger.set_enabled(false).is_err());
    assert!(ledger.get_preferences().enabled);
    std::fs::remove_dir(&path).unwrap();
    drop(ledger);
    for bytes in [
        "broken",
        r#"{"schemaVersion":99,"enabled":false,"timezone":"UTC","epoch":1}"#,
    ] {
        std::fs::write(&path, bytes).unwrap();
        assert!(Ledger::open(&dir.0, "UTC").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), bytes);
    }
}
#[test]
fn sqlite_write_failure_rolls_back_and_retries_without_new_official_response() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    ledger
        .connection
        .execute_batch("PRAGMA query_only=ON")
        .unwrap();
    assert!(ledger
        .observe(Some(A), &limits("2026-01-01T10:01:00Z", 28.0))
        .is_err());
    let failed = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(failed.storage_status, "write_failed");
    assert_eq!(failed.read_status, "ready");
    assert_eq!(failed.daily[0].sample_count, 1);
    assert_eq!(failed.daily[0].consumed_percent_points, None);
    ledger
        .connection
        .execute_batch("PRAGMA query_only=OFF")
        .unwrap();
    ledger.last_retry = Some(Instant::now() - Duration::from_secs(6));
    assert!(ledger.retry_pending().unwrap());
    assert_eq!(total(&ledger), Some(8.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().storage_status,
        "ready"
    );
    assert!(!ledger.retry_pending().unwrap());
}
fn legacy(directory: &Path, timezone: &str) -> Vec<u8> {
    let at = |s: &str| store::timestamp(s).unwrap() / 1000;
    let value = serde_json::json!({"schemaVersion":1,"identityHash":A,"cycles":[{"kind":"session","windowMinutes":300,"resetsAt":at("2026-01-03T00:00:00Z"),"timezone":timezone,"last":{"at":at("2026-01-01T10:05:00Z"),"used":28},"days":[{"date":"2026-01-01","consumed":8,"intervals":[{"start":at("2026-01-01T10:00:00Z"),"end":at("2026-01-01T10:01:00Z")},{"start":at("2026-01-01T10:04:00Z"),"end":at("2026-01-01T10:05:00Z")}]}]}]});
    let bytes = serde_json::to_vec(&value).unwrap();
    std::fs::write(directory.join("coach-observations.json"), &bytes).unwrap();
    bytes
}
fn migration_ledger(dir: &Temp) -> Ledger {
    let ledger = dir.ledger();
    // A deterministic persisted migration cutover for the synthetic January source.
    ledger
        .connection
        .execute(
            "UPDATE meta SET value=?1 WHERE key='migration-v1-cutover'",
            [store::timestamp("2026-01-01T10:05:00Z")
                .unwrap()
                .to_string()],
        )
        .unwrap();
    ledger
}
#[test]
fn migration_freezes_once_imports_exact_coverage_and_never_uses_legacy_last_as_baseline() {
    let dir = Temp::new();
    let bytes = legacy(&dir.0, "UTC");
    {
        let _ledger = migration_ledger(&dir);
    }
    std::fs::write(
        dir.0.join("coach-observations.json"),
        b"coach changed after configure",
    )
    .unwrap();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(&ledger), Some(8.0));
    let row = &ledger.query(Some(A), RANGE).unwrap().daily[0];
    assert_eq!(row.covered_minutes, 2.0);
    let migrated: Vec<_> = ledger
        .export_segments(Some(A), RANGE)
        .unwrap()
        .into_iter()
        .filter(|s| s.source == "coach_migration")
        .collect();
    assert_eq!(migrated.len(), 2);
    assert_eq!(migrated[0].start_used_percent, None);
    assert_eq!(migrated[1].consumed_percent_points, None);
    assert_eq!(migrated[1].covered_minutes, 1.0);
    observe(&mut ledger, "2026-01-01T10:07:00Z", 42.0);
    assert_eq!(total(&ledger), Some(10.0));
    drop(ledger);
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:07:00Z", 42.0);
    assert_eq!(total(&ledger), Some(10.0));
    assert_eq!(
        std::fs::read(dir.0.join("coach-observations.json")).unwrap(),
        b"coach changed after configure"
    );
    assert!(!bytes.is_empty());
}
#[test]
fn migration_mismatch_does_not_claim_another_scope_and_transaction_failure_is_restartable() {
    let dir = Temp::new();
    legacy(&dir.0, "UTC");
    let mut ledger = migration_ledger(&dir);
    ledger
        .observe(Some(B), &limits("2026-01-01T10:06:00Z", 40.0))
        .unwrap();
    assert_eq!(
        ledger.query(Some(B), RANGE).unwrap().daily[0].consumed_percent_points,
        None
    );
    ledger.connection.execute_batch("CREATE TRIGGER reject_import BEFORE INSERT ON segments WHEN NEW.source='coach_migration' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;").unwrap();
    assert!(ledger
        .observe(Some(A), &limits("2026-01-01T10:06:00Z", 40.0))
        .is_err());
    assert!(ledger.query(Some(A), RANGE).unwrap().daily.is_empty());
    drop(ledger);
    let mut ledger = dir.ledger();
    ledger
        .connection
        .execute_batch("DROP TRIGGER reject_import")
        .unwrap();
    observe(&mut ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(&ledger), Some(8.0));
}
#[test]
fn migration_rejects_timezone_mismatch() {
    let dir = Temp::new();
    legacy(&dir.0, "Asia/Tokyo");
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(&ledger), None);
    assert!(ledger
        .export_segments(Some(A), RANGE)
        .unwrap()
        .iter()
        .all(|s| s.source == "official"));
}
#[test]
fn stable_readings_merge_without_capping_history_and_details_page_all_changes() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    let base = store::timestamp("2026-01-01T10:00:00Z").unwrap();
    for minute in 0..150 {
        observe(&mut ledger, &store::iso(base + minute * 60_000), 20.0);
    }
    assert_eq!(ledger.export_segments(Some(A), RANGE).unwrap().len(), 2);
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].sample_count,
        150
    );
    for minute in 150..300 {
        observe(
            &mut ledger,
            &store::iso(base + minute * 60_000),
            20.0 + (minute - 149) as f64 / 10.0,
        );
    }
    let first = ledger
        .query_day(Some(A), "2026-01-01", "session", 300, None)
        .unwrap();
    assert_eq!(first.segments.len(), 100);
    assert!(first.next_before.is_some());
    let second = ledger
        .query_day(Some(A), "2026-01-01", "session", 300, first.next_before)
        .unwrap();
    assert_eq!(second.segments.len(), 52);
    assert!(second.next_before.is_none());
    let snapshot = ledger.export_snapshot(Some(A), RANGE).unwrap();
    assert_eq!(snapshot.1.len(), 152);
    assert_eq!(snapshot.0.daily[0].sample_count, 300);
    let encoded = serde_json::to_string(&snapshot).unwrap();
    assert!(!encoded.contains(A));
    assert!(!encoded.contains("identityHash"));
    assert!(!encoded.contains("epoch"));
}
#[test]
fn long_term_history_has_no_31_day_retention_limit() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    let base = store::timestamp("2025-01-01T10:00:00Z").unwrap();
    for day in 0..400 {
        for (minute, used) in [(0, 20.0), (1, 21.0)] {
            let mut response = limits(&store::iso(base + day * 86_400_000 + minute * 60_000), used);
            response.session.as_mut().unwrap().resets_at = Some("2027-01-01T00:00:00Z".into());
            ledger.observe(Some(A), &response).unwrap();
        }
    }
    let old = ledger
        .query(Some(A), "custom:2025-01-01_2025-12-31")
        .unwrap();
    assert_eq!(old.daily.len(), 365);
    assert_eq!(old.daily[0].consumed_percent_points, Some(1.0));
    assert_eq!(old.summaries[0].consumed_percent_points, Some(365.0));
    assert!(ledger.query(Some(A), "366d").is_ok());
    assert!(ledger
        .query(Some(A), "custom:2025-01-01_2026-01-02")
        .is_err());
}
#[test]
fn dst_days_cover_the_actual_23_and_25_hour_day_and_timezone_stays_fixed() {
    for (day, start, minutes) in [
        ("2026-03-08", "2026-03-08T05:00:00Z", 1380),
        ("2026-11-01", "2026-11-01T04:00:00Z", 1500),
    ] {
        let dir = Temp::new();
        let mut ledger = Ledger::open(&dir.0, "America/New_York").unwrap();
        let base = store::timestamp(start).unwrap();
        for minute in (0..minutes).step_by(5).chain(std::iter::once(minutes - 1)) {
            let mut response = limits(&store::iso(base + minute * 60_000), 20.0);
            response.session.as_mut().unwrap().resets_at = Some("2027-01-01T00:00:00Z".into());
            ledger.observe(Some(A), &response).unwrap();
        }
        let result = ledger
            .query(Some(A), &format!("custom:{day}_{day}"))
            .unwrap();
        assert_eq!(result.daily.len(), 1);
        assert_eq!(result.daily[0].covered_minutes, (minutes - 1) as f64);
        drop(ledger);
        assert_eq!(
            Ledger::open(&dir.0, "Asia/Tokyo")
                .unwrap()
                .get_preferences()
                .timezone,
            "America/New_York"
        );
    }
}

#[test]
fn existing_empty_database_is_not_silently_reinitialized_after_truncation() {
    let dir = Temp::new();
    let path = dir.0.join("quota-history.db");
    std::fs::write(&path, b"").unwrap();
    assert!(Ledger::open(&dir.0, "UTC").is_err());
    assert!(std::fs::read(&path).unwrap().is_empty());
}
#[test]
fn migration_freeze_only_persists_verified_whitelisted_fields() {
    let dir = Temp::new();
    let bytes = legacy(&dir.0, "UTC");
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    value["accessToken"] = serde_json::json!("secret-must-never-persist");
    std::fs::write(
        dir.0.join("coach-observations.json"),
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
    let ledger = dir.ledger();
    let frozen: String = ledger
        .connection
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-frozen'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(!frozen.contains("secret-must-never-persist"));
}
#[test]
fn range_summary_counts_a_cross_day_segment_once_and_includes_gap_on_missing_middle_days() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    let mut first = limits("2026-01-01T10:00:00Z", 20.0);
    first.session.as_mut().unwrap().resets_at = Some("2026-02-01T00:00:00Z".into());
    ledger.observe(Some(A), &first).unwrap();
    first.updated_at = "2026-01-03T10:00:00Z".into();
    first.session.as_mut().unwrap().used_percent = 28.0;
    first.session.as_mut().unwrap().remaining_percent = 72.0;
    ledger.observe(Some(A), &first).unwrap();
    let result = ledger
        .query(Some(A), "custom:2026-01-01_2026-01-03")
        .unwrap();
    assert_eq!(result.unallocated_count, 1);
    assert_eq!(result.summaries[0].unallocated_count, 1);
    assert_eq!(result.daily.len(), 3);
    assert_eq!(result.daily[1].unallocated_count, 1);
}
#[test]
fn disabled_epoch_does_not_count_as_a_new_official_cycle_and_pending_observation_retains_epoch() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T10:01:00Z", 28.0);
    ledger
        .connection
        .execute_batch("PRAGMA query_only=ON")
        .unwrap();
    assert!(ledger
        .observe(Some(A), &limits("2026-01-01T10:02:00Z", 30.0))
        .is_err());
    ledger.set_enabled(false).unwrap();
    ledger.set_enabled(true).unwrap();
    ledger
        .connection
        .execute_batch("PRAGMA query_only=OFF")
        .unwrap();
    observe(&mut ledger, "2026-01-01T10:03:00Z", 60.0);
    observe(&mut ledger, "2026-01-01T10:04:00Z", 61.0);
    assert_eq!(total(&ledger), Some(11.0));
    assert_eq!(
        ledger.query(Some(A), RANGE).unwrap().daily[0].cycle_count,
        1
    );
}
#[test]
fn genuine_reset_change_is_a_second_cycle_and_new_nonzero_reading_is_only_a_baseline() {
    let dir = Temp::new();
    let mut ledger = dir.ledger();
    observe(&mut ledger, "2026-01-01T01:00:00Z", 0.0);
    observe(&mut ledger, "2026-01-01T01:01:00Z", 90.0);
    for (at, used) in [
        ("2026-01-01T02:00:00Z", 10.0),
        ("2026-01-01T02:01:00Z", 80.0),
    ] {
        let mut next = limits(at, used);
        next.session.as_mut().unwrap().resets_at = Some("2026-01-04T00:00:00Z".into());
        ledger.observe(Some(A), &next).unwrap();
    }
    let result = ledger.query(Some(A), RANGE).unwrap();
    assert_eq!(result.daily[0].cycle_count, 2);
    assert_eq!(result.daily[0].consumed_percent_points, Some(160.0));
    assert!(ledger
        .export_segments(Some(A), RANGE)
        .unwrap()
        .iter()
        .any(|s| s.reason == "cycle_changed" && s.consumed_percent_points.is_none()));
}
#[test]
fn invalid_initial_statistics_timezone_falls_back_to_the_system_zone() {
    let dir = Temp::new();
    let ledger = Ledger::open(&dir.0, "not/a/valid/zone").unwrap();
    let expected = iana_time_zone::get_timezone()
        .ok()
        .and_then(|s| s.parse::<chrono_tz::Tz>().ok())
        .unwrap_or(chrono_tz::UTC);
    assert_eq!(ledger.get_preferences().timezone, expected.name());
}

#[test]
fn migration_cutover_refuses_cached_pre_cutover_baselines_and_does_not_double_import() {
    let dir = Temp::new();
    legacy(&dir.0, "UTC");
    let mut ledger = migration_ledger(&dir);
    observe(&mut ledger, "2026-01-01T10:00:00Z", 20.0);
    observe(&mut ledger, "2026-01-01T10:04:00Z", 26.0);
    assert_eq!(total(&ledger), Some(8.0));
    assert!(ledger
        .export_segments(Some(A), RANGE)
        .unwrap()
        .iter()
        .all(|s| s.source == "coach_migration"));
    observe(&mut ledger, "2026-01-01T10:06:00Z", 40.0);
    observe(&mut ledger, "2026-01-01T10:07:00Z", 42.0);
    assert_eq!(total(&ledger), Some(10.0));
}
#[test]
fn duplicated_legacy_days_are_unverifiable_and_never_double_imported() {
    let dir = Temp::new();
    let bytes = legacy(&dir.0, "UTC");
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let duplicate = value["cycles"][0]["days"][0].clone();
    value["cycles"][0]["days"]
        .as_array_mut()
        .unwrap()
        .push(duplicate);
    std::fs::write(
        dir.0.join("coach-observations.json"),
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
    let mut ledger = migration_ledger(&dir);
    observe(&mut ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(&ledger), None);
}

#[test]
fn first_freeze_commit_failure_protects_the_only_legacy_source_through_restart() {
    let dir = Temp::new();
    let original = legacy(&dir.0, "UTC");
    drop(store::open(&dir.0).unwrap());
    let blocker = rusqlite::Connection::open(dir.0.join("quota-history.db")).unwrap();
    // A real SQLite shared read lock permits both INSERTs, but prevents freeze's COMMIT.
    blocker
        .execute_batch("BEGIN; SELECT COUNT(*) FROM meta;")
        .unwrap();
    let runtime = Runtime::new(&dir.0, "UTC");
    assert!(runtime.ledger.is_err());
    let marker_count: i64 = blocker
        .query_row(
            "SELECT COUNT(*) FROM meta WHERE key='migration-v1-frozen'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(marker_count, 0);
    // Model the success point's destructive coach account/cycle replacement behind the real gate.
    if runtime.legacy_source_secured() {
        std::fs::write(
            dir.0.join("coach-observations.json"),
            b"replacement for new identity and reset",
        )
        .unwrap();
    }
    assert_eq!(
        std::fs::read(dir.0.join("coach-observations.json")).unwrap(),
        original
    );
    drop(runtime);
    blocker.execute_batch("ROLLBACK").unwrap();
    drop(blocker);
    let mut recovered = migration_ledger(&dir);
    observe(&mut recovered, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(&recovered), Some(8.0));
    drop(recovered);
    let mut recovered = dir.ledger();
    observe(&mut recovered, "2026-01-01T10:07:00Z", 42.0);
    assert_eq!(total(&recovered), Some(10.0));
}

#[test]
fn failed_initialization_retries_locally_after_database_unblocks() {
    let dir = Temp::new();
    let original = legacy(&dir.0, "UTC");
    let path = dir.0.join("quota-history.db");
    std::fs::create_dir(&path).unwrap();
    let mut runtime = Runtime::new(&dir.0, "UTC");
    assert!(runtime.ledger.is_err());
    assert!(!runtime.legacy_source_secured());
    std::fs::remove_dir(&path).unwrap();
    runtime.last_attempt = Instant::now() - Duration::from_secs(6);
    assert!(runtime.retry_pending().unwrap());
    assert!(runtime.ledger.is_ok());
    assert!(runtime.legacy_source_secured());
    assert_eq!(
        std::fs::read(dir.0.join("coach-observations.json")).unwrap(),
        original
    );
    let ledger = runtime.ledger.as_mut().unwrap();
    ledger
        .connection
        .execute(
            "UPDATE meta SET value=?1 WHERE key='migration-v1-cutover'",
            [store::timestamp("2026-01-01T10:05:00Z")
                .unwrap()
                .to_string()],
        )
        .unwrap();
    observe(ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(ledger), Some(8.0));
}

#[test]
fn preferences_failure_does_not_prevent_durable_freeze_or_future_local_recovery() {
    let dir = Temp::new();
    let original = legacy(&dir.0, "UTC");
    std::fs::write(dir.0.join(preferences::FILE), b"damaged preferences").unwrap();
    let mut runtime = Runtime::new(&dir.0, "UTC");
    assert!(runtime.ledger.is_err());
    assert!(runtime.legacy_source_secured());
    // Coach can now replace its source because an actual persisted copy must exist.
    std::fs::write(
        dir.0.join("coach-observations.json"),
        b"coach now changed identity",
    )
    .unwrap();
    let check = rusqlite::Connection::open(dir.0.join("quota-history.db")).unwrap();
    let frozen: String = check
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-frozen'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let frozen: serde_json::Value = serde_json::from_str(&frozen).unwrap();
    assert_eq!(frozen["identityHash"].as_str(), Some(A));
    assert_eq!(
        frozen["cycles"][0]["days"][0]["consumed"].as_f64(),
        Some(8.0)
    );
    assert_eq!(
        frozen["cycles"][0]["days"][0]["intervals"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(!original.is_empty());
    drop(check);
    std::fs::remove_file(dir.0.join(preferences::FILE)).unwrap();
    runtime.last_attempt = Instant::now() - Duration::from_secs(6);
    assert!(runtime.retry_pending().unwrap());
    let ledger = runtime.ledger.as_mut().unwrap();
    ledger
        .connection
        .execute(
            "UPDATE meta SET value=?1 WHERE key='migration-v1-cutover'",
            [store::timestamp("2026-01-01T10:05:00Z")
                .unwrap()
                .to_string()],
        )
        .unwrap();
    observe(ledger, "2026-01-01T10:06:00Z", 40.0);
    assert_eq!(total(ledger), Some(8.0));
}

#[test]
fn absent_legacy_source_does_not_block_coach_when_initialization_fails_or_recording_is_disabled() {
    let dir = Temp::new();
    std::fs::create_dir(dir.0.join("quota-history.db")).unwrap();
    let runtime = Runtime::new(&dir.0, "UTC");
    assert!(runtime.ledger.is_err());
    assert!(runtime.legacy_source_secured());
    drop(runtime);
    std::fs::remove_dir(dir.0.join("quota-history.db")).unwrap();
    let mut ledger = dir.ledger();
    ledger.set_enabled(false).unwrap();
    drop(ledger);
    let runtime = Runtime::new(&dir.0, "UTC");
    assert!(!runtime.ledger.as_ref().unwrap().get_preferences().enabled);
    assert!(runtime.legacy_source_secured());
}

#[test]
fn retry_tick_is_local_bounded_and_does_not_permanently_cache_initialization_errors() {
    let dir = Temp::new();
    let path = dir.0.join("quota-history.db");
    std::fs::create_dir(&path).unwrap();
    let mut runtime = Runtime::new(&dir.0, "UTC");
    assert!(runtime.ledger.is_err());
    std::fs::remove_dir(&path).unwrap();
    assert!(!runtime.retry_pending().unwrap());
    assert!(runtime.ledger.is_err());
    runtime.last_attempt = Instant::now() - Duration::from_secs(6);
    assert!(runtime.retry_pending().unwrap());
    assert!(runtime.ledger.is_ok());
    assert!(!runtime.retry_pending().unwrap());
}
