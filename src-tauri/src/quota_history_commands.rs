//! Desktop-only local queries. These commands never fetch account quota.
use crate::quota_history::{
    QuotaHistoryDayResponse, QuotaHistoryResponse, QuotaRecordingPreferences,
};
use tauri::Emitter;

/// Anonymous errors for IPC, without filesystem paths, identity keys or SQLite text.
#[derive(Debug, serde::Serialize)]
pub struct QuotaHistoryCommandError {
    code: &'static str,
}
impl QuotaHistoryCommandError {
    fn local(error: String, fallback: &'static str) -> Self {
        Self {
            code: match error.as_str() {
                crate::quota_history::STORAGE_UNAVAILABLE => "storage_unavailable",
                "identityChanged" => "identity_changed",
                _ => fallback,
            },
        }
    }
}

fn with_current_scope<T>(
    read: impl FnOnce(Option<&str>) -> Result<T, String>,
) -> Result<(u64, T), String> {
    let environment = crate::codex_environment::selected_codex_environment();
    let auth = crate::codex_auth::load_codex_auth().ok();
    read_snapshot(
        auth.as_ref(),
        &environment,
        || {
            crate::codex_environment::selected_codex_environment() == environment
                && crate::codex_auth::load_codex_auth().ok() == auth
        },
        read,
    )
}

fn read_snapshot<T>(
    auth: Option<&crate::codex_auth::CodexAuth>,
    environment: &crate::codex_environment::CodexEnvironment,
    credentials_current: impl Fn() -> bool,
    read: impl FnOnce(Option<&str>) -> Result<T, String>,
) -> Result<(u64, T), String> {
    if !credentials_current() {
        return Err("identityChanged".into());
    }
    let read_bound = |identity: Option<&str>, revision| {
        if !credentials_current() {
            return Err("identityChanged".into());
        }
        let result = read(identity)?;
        // A source/config change can precede the desktop identity watcher's next tick.
        if !credentials_current() {
            return Err("identityChanged".into());
        }
        Ok((revision, result))
    };
    match auth {
        Some(auth) => {
            // Identity and revision are produced from this one captured account/source.
            let (identity, revision) = crate::pulse_pace::begin_account(auth, environment);
            crate::quota_scope::with_current(revision, || read_bound(identity.as_deref(), revision))
                .ok_or_else(|| "identityChanged".to_string())?
        }
        None => {
            crate::pulse_pace::unavailable("login_required");
            crate::quota_scope::reconcile_with(None, |revision| read_bound(None, revision))
        }
    }
}

// This is the official provider's status, never the result of a local history query.
fn read_status(scope_available: bool, failed: bool) -> &'static str {
    if !scope_available {
        "identity_unavailable"
    } else if failed {
        "read_failed"
    } else {
        "ready"
    }
}

#[tauri::command]
pub async fn get_quota_recording_preferences(
) -> Result<QuotaRecordingPreferences, QuotaHistoryCommandError> {
    tauri::async_runtime::spawn_blocking(crate::quota_history::get_preferences)
        .await
        .map_err(|_| QuotaHistoryCommandError {
            code: "preferences_read_failed",
        })?
        .map_err(|error| QuotaHistoryCommandError::local(error, "preferences_read_failed"))
}

#[tauri::command]
pub async fn set_quota_recording_enabled(
    enabled: bool,
    app: tauri::AppHandle,
) -> Result<QuotaRecordingPreferences, QuotaHistoryCommandError> {
    let result =
        tauri::async_runtime::spawn_blocking(move || crate::quota_history::set_enabled(enabled))
            .await
            .map_err(|_| QuotaHistoryCommandError {
                code: "preferences_save_failed",
            })?
            .map_err(|error| QuotaHistoryCommandError::local(error, "preferences_save_failed"))?;
    let _ = app.emit("quota-history-updated", ());
    Ok(result)
}

#[tauri::command]
pub async fn fetch_quota_history(
    range: String,
) -> Result<QuotaHistoryResponse, QuotaHistoryCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (revision, mut response) =
            with_current_scope(|identity| crate::quota_history::query(identity, &range))?;
        response.identity_revision = revision;
        response.read_status = read_status(
            response.scope_available,
            crate::pulse_pace_view::refresh_failed(),
        )
        .into();
        Ok::<_, String>(response)
    })
    .await
    .map_err(|_| QuotaHistoryCommandError {
        code: "local_read_failed",
    })?
    .map_err(|error| QuotaHistoryCommandError::local(error, "local_read_failed"))
}

#[tauri::command]
pub async fn fetch_quota_history_day(
    date: String,
    kind: String,
    window_minutes: i64,
    before: Option<i64>,
) -> Result<QuotaHistoryDayResponse, QuotaHistoryCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (revision, mut response) = with_current_scope(|identity| {
            crate::quota_history::query_day(identity, &date, &kind, window_minutes, before)
        })?;
        response.identity_revision = revision;
        response.read_status = read_status(
            response.scope_available,
            crate::pulse_pace_view::refresh_failed(),
        )
        .into();
        Ok::<_, String>(response)
    })
    .await
    .map_err(|_| QuotaHistoryCommandError {
        code: "local_read_failed",
    })?
    .map_err(|error| QuotaHistoryCommandError::local(error, "local_read_failed"))
}

#[tauri::command]
pub async fn export_quota_history(
    range: String,
    format: String,
    path: String,
) -> Result<crate::types::ExportResponse, QuotaHistoryCommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, (mut history, segments)) =
            with_current_scope(|identity| crate::quota_history::export_snapshot(identity, &range))?;
        if !history.scope_available {
            return Err("A current account is required to export quota history".into());
        }
        history.read_status = read_status(true, crate::pulse_pace_view::refresh_failed()).into();
        crate::quota_history_export::export(
            &history,
            &segments,
            &range,
            &format,
            std::path::Path::new(&path),
        )
    })
    .await
    .map_err(|_| QuotaHistoryCommandError {
        code: "export_failed",
    })?
    .map_err(|error| QuotaHistoryCommandError::local(error, "export_failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_storage_initialization_has_an_anonymous_unavailable_contract() {
        for cause in ["database", "preferences"] {
            let directory =
                std::env::temp_dir().join(format!("quota-contract-{}", uuid::Uuid::new_v4()));
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--ignored",
                    "--exact",
                    "quota_history_commands::tests::storage_initialization_worker",
                ])
                .env("PULSE_QUOTA_STORAGE_TEST", cause)
                .env("PULSE_QUOTA_STORAGE_TEST_DIRECTORY", &directory)
                .status()
                .unwrap();
            std::fs::remove_dir_all(&directory).unwrap();
            assert!(status.success(), "{cause} initialization contract failed");
        }
    }

    #[test]
    #[ignore = "Isolated local runtime exercised by failed_storage_initialization test"]
    fn storage_initialization_worker() {
        let cause = std::env::var("PULSE_QUOTA_STORAGE_TEST").unwrap();
        let directory = std::path::PathBuf::from(
            std::env::var_os("PULSE_QUOTA_STORAGE_TEST_DIRECTORY").unwrap(),
        );
        std::fs::create_dir_all(&directory).unwrap();
        let name = if cause == "database" {
            "quota-history.db"
        } else {
            "quota-recording-preferences.json"
        };
        let original = b"damaged original file must survive";
        std::fs::write(directory.join(name), original).unwrap();
        assert!(crate::quota_history::configure(&directory).is_err());
        assert!(!crate::quota_history::recording_enabled());
        let error = tauri::async_runtime::block_on(get_quota_recording_preferences()).unwrap_err();
        let encoded = serde_json::to_value(error).unwrap();
        assert_eq!(encoded, serde_json::json!({"code":"storage_unavailable"}));
        // Use the same command error mapping without loading real account credentials.
        let identity = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        for error in [
            crate::quota_history::query(Some(identity), "1d").unwrap_err(),
            crate::quota_history::query_day(Some(identity), "2026-01-01", "session", 300, None)
                .unwrap_err(),
        ] {
            let error = QuotaHistoryCommandError::local(error, "local_read_failed");
            assert_eq!(
                serde_json::to_value(error).unwrap(),
                serde_json::json!({"code":"storage_unavailable"})
            );
        }
        assert_eq!(std::fs::read(directory.join(name)).unwrap(), original);
        // SQLite handles end with the child; temp files contain only synthetic inputs.
    }

    #[test]
    fn ordinary_local_failure_is_anonymous_without_claiming_recording_is_paused() {
        let error = QuotaHistoryCommandError::local(
            "SQLite failure at PRIVATE_LOCAL_PATH".into(),
            "local_read_failed",
        );
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({"code":"local_read_failed"})
        );
        let error = QuotaHistoryCommandError::local("identityChanged".into(), "local_read_failed");
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({"code":"identity_changed"})
        );
    }

    #[test]
    fn saved_sqlite_history_remains_readable_when_only_official_sampling_failed() {
        let directory =
            std::env::temp_dir().join(format!("quota-provider-failure-{}", uuid::Uuid::new_v4()));
        let identity = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let mut ledger = crate::quota_history::Ledger::open(&directory, "UTC").unwrap();
        let mut limits = crate::types::CodexLimitsResponse {
            identity_revision: None,
            session: Some(crate::types::CodexLimitWindow {
                used_percent: 20.0,
                remaining_percent: 80.0,
                window_minutes: Some(300),
                resets_at: Some("2026-01-03T00:00:00Z".into()),
            }),
            weekly: None,
            credits: None,
            credits_is_mock: false,
            reset_credits_available_count: None,
            reset_credits: None,
            updated_at: "2026-01-01T10:00:00Z".into(),
            source: "oauth".into(),
            account: None,
            membership_level: None,
            workspace_name: None,
            subscription_expires_at: None,
            subscription_will_renew: None,
        };
        ledger.observe(Some(identity), &limits).unwrap();
        limits.session.as_mut().unwrap().used_percent = 28.0;
        limits.session.as_mut().unwrap().remaining_percent = 72.0;
        limits.updated_at = "2026-01-01T10:01:00Z".into();
        ledger.observe(Some(identity), &limits).unwrap();
        let mut response = ledger
            .query(Some(identity), "custom:2026-01-01_2026-01-01")
            .unwrap();
        response.read_status = read_status(response.scope_available, true).into();
        assert_eq!(response.read_status, "read_failed");
        assert_eq!(response.storage_status, "ready");
        assert_eq!(response.daily[0].consumed_percent_points, Some(8.0));
        let mut day = ledger
            .query_day(Some(identity), "2026-01-01", "session", 300, None)
            .unwrap();
        day.read_status = read_status(day.scope_available, true).into();
        assert_eq!(day.read_status, "read_failed");
        assert!(day
            .segments
            .iter()
            .any(|segment| segment.consumed_percent_points == Some(8.0)));
        let local_error = ledger.query(Some(identity), "367d").unwrap_err();
        assert_eq!(
            QuotaHistoryCommandError::local(local_error, "local_read_failed").code,
            "local_read_failed"
        );
        drop(ledger);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn current_read_failure_does_not_turn_history_storage_into_a_read_error() {
        assert_eq!(read_status(true, true), "read_failed");
        assert_eq!(read_status(false, true), "identity_unavailable");
        assert_eq!(read_status(false, false), "identity_unavailable");
        assert_eq!(read_status(true, false), "ready");
    }

    #[test]
    fn captured_identity_and_revision_stay_bound_across_controlled_account_switches() {
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "quota_history_commands::tests::scope_snapshot_worker",
            ])
            .env("PULSE_QUOTA_SCOPE_TEST", "1")
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    #[ignore = "Synthetic account-scope subprocess exercised by captured_identity_and_revision test"]
    fn scope_snapshot_worker() {
        assert_eq!(std::env::var("PULSE_QUOTA_SCOPE_TEST").as_deref(), Ok("1"));
        use crate::{
            codex_auth::CodexAuth,
            codex_environment::{CodexEnvironment, CodexRuntime},
        };
        let environment = CodexEnvironment {
            home: std::path::PathBuf::from("F:/synthetic-quota-query"),
            runtime: CodexRuntime::Native,
        };
        let auth = |name: &str| CodexAuth {
            access_token: "synthetic-not-a-credential".into(),
            account_id: Some(name.into()),
            user_id: Some("synthetic-user".into()),
            is_chatgpt: true,
        };
        let a = auth("synthetic-a");
        let b = auth("synthetic-b");
        let (_, revision_a) = crate::pulse_pace::begin_account(&a, &environment);
        let expected_b = crate::pulse_pace::stable_identity(&b, &environment);
        // A's watcher ran, then the capture now sees B. The returned revision must belong to B.
        let (revision_b, identity) = read_snapshot(
            Some(&b),
            &environment,
            || true,
            |id| Ok(id.map(str::to_owned)),
        )
        .unwrap();
        assert_eq!(identity, expected_b);
        assert!(
            revision_b > revision_a,
            "B history must not carry A's revision"
        );
        assert!(crate::quota_scope::with_current(revision_a, || ()).is_none());

        let (revision_none, identity) =
            read_snapshot(None, &environment, || true, |id| Ok(id.map(str::to_owned))).unwrap();
        assert!(identity.is_none());
        assert!(
            revision_none > revision_b,
            "An unavailable identity must also retire the previous account"
        );

        let was_read = std::cell::Cell::new(false);
        let result = read_snapshot(
            Some(&b),
            &environment,
            || false,
            |_| {
                was_read.set(true);
                Ok(())
            },
        );
        assert!(result.is_err());
        assert!(
            !was_read.get(),
            "Already-stale credentials must not enter a history query"
        );
        let current = std::cell::Cell::new(true);
        assert!(read_snapshot(
            Some(&b),
            &environment,
            || current.get(),
            |_| {
                current.set(false);
                Ok(())
            }
        )
        .is_err());
    }
}
