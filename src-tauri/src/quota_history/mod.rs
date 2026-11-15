//! Desktop-only durable official quota history. Never stores credentials or log content.
mod migration;
pub mod models;
mod preferences;
mod store;
use crate::types::CodexLimitsResponse;
pub use models::*;
use preferences::Preferences;
use rusqlite::Connection;
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

struct Pending {
    identity: String,
    limits: CodexLimitsResponse,
    epoch: u64,
    queued: Instant,
}
pub struct Ledger {
    connection: Connection,
    directory: PathBuf,
    preferences: Preferences,
    storage_status: String,
    pending: VecDeque<Pending>,
    last_retry: Option<Instant>,
}
struct Initialization {
    ledger: Result<Ledger, String>,
    legacy_source_secured: bool,
}
impl Ledger {
    #[cfg(test)]
    pub fn open(directory: &Path, timezone: &str) -> Result<Self, String> {
        Self::initialize(directory, timezone).ledger
    }
    fn initialize(directory: &Path, timezone: &str) -> Initialization {
        // No prior source means there is no upgrade history for coach to overwrite.
        // All other inspection errors remain protected until a durable freeze succeeds.
        let mut legacy_source_secured = migration::source_absent(directory);
        let ledger = (|| {
            std::fs::create_dir_all(directory)
                .map_err(|_| "Cannot create quota history directory")?;
            let connection = store::open(directory)?;
            migration::freeze(&connection, directory)?;
            // This is set only after freeze COMMIT (or its existing persisted marker).
            // Preference errors can pause history without blocking an already protected coach.
            legacy_source_secured = true;
            let preferences = Preferences::load(directory, timezone)?;
            Ok(Self {
                connection,
                directory: directory.into(),
                preferences,
                storage_status: "ready".into(),
                pending: VecDeque::new(),
                last_retry: None,
            })
        })();
        Initialization {
            ledger,
            legacy_source_secured,
        }
    }
    pub fn get_preferences(&self) -> QuotaRecordingPreferences {
        self.preferences.public()
    }
    pub fn set_enabled(&mut self, enabled: bool) -> Result<QuotaRecordingPreferences, String> {
        if self.preferences.enabled == enabled {
            return Ok(self.get_preferences());
        }
        let mut next = self.preferences.clone();
        next.enabled = enabled;
        next.epoch = next
            .epoch
            .checked_add(1)
            .ok_or("Quota recording epoch exhausted")?;
        next.save(&self.directory)?;
        self.preferences = next;
        Ok(self.get_preferences())
    }
    pub fn observe(
        &mut self,
        identity: Option<&str>,
        limits: &CodexLimitsResponse,
    ) -> Result<bool, String> {
        let Some(identity) = identity.filter(|s| store::valid_identity(s)) else {
            return Ok(false);
        };
        if !self.preferences.enabled {
            return Ok(false);
        };
        self.pending.push_back(Pending {
            identity: identity.into(),
            limits: limits.clone(),
            epoch: self.preferences.epoch,
            queued: Instant::now(),
        });
        if self.pending.len() > 128 {
            self.pending.pop_front();
        }
        self.flush_pending()
    }
    fn flush_pending(&mut self) -> Result<bool, String> {
        let mut changed = self.storage_status != "ready";
        while self
            .pending
            .front()
            .is_some_and(|p| p.queued.elapsed() > Duration::from_secs(1800))
        {
            self.pending.pop_front();
        }
        while let Some(pending) = self.pending.front() {
            let result = store::observe(
                &mut self.connection,
                &pending.identity,
                &pending.limits,
                pending.epoch,
                &self.preferences.timezone,
            );
            match result {
                Ok(accepted) => {
                    changed |= accepted;
                    self.pending.pop_front();
                }
                Err(error) => {
                    self.storage_status = "write_failed".into();
                    self.last_retry = Some(Instant::now());
                    return Err(error);
                }
            }
        }
        self.storage_status = "ready".into();
        Ok(changed)
    }
    pub fn retry_pending(&mut self) -> Result<bool, String> {
        if self.pending.is_empty()
            || self
                .last_retry
                .is_some_and(|at| at.elapsed() < Duration::from_secs(5))
        {
            return Ok(false);
        };
        self.flush_pending()
    }
    pub fn query(
        &self,
        identity: Option<&str>,
        range: &str,
    ) -> Result<QuotaHistoryResponse, String> {
        store::query(
            &self.connection,
            identity,
            range,
            &self.preferences,
            &self.storage_status,
        )
    }
    pub fn query_day(
        &self,
        identity: Option<&str>,
        date: &str,
        kind: &str,
        minutes: i64,
        before: Option<i64>,
    ) -> Result<QuotaHistoryDayResponse, String> {
        store::query_day(
            &self.connection,
            identity,
            date,
            kind,
            minutes,
            before,
            &self.preferences.timezone,
            &self.storage_status,
        )
    }
    #[cfg(test)]
    pub fn export_segments(
        &self,
        identity: Option<&str>,
        range: &str,
    ) -> Result<Vec<QuotaHistorySegment>, String> {
        store::export_segments(
            &self.connection,
            identity,
            range,
            &self.preferences.timezone,
        )
    }
    pub fn export_snapshot(
        &self,
        identity: Option<&str>,
        range: &str,
    ) -> Result<(QuotaHistoryResponse, Vec<QuotaHistorySegment>), String> {
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(|_| "Cannot read quota history export snapshot")?;
        let summary = store::query(
            &tx,
            identity,
            range,
            &self.preferences,
            &self.storage_status,
        )?;
        let segments = store::export_segments(&tx, identity, range, &self.preferences.timezone)?;
        tx.commit()
            .map_err(|_| "Cannot finish quota history export snapshot")?;
        Ok((summary, segments))
    }
}

struct Runtime {
    directory: PathBuf,
    timezone: String,
    ledger: Result<Ledger, String>,
    last_attempt: Instant,
    legacy_source_secured: bool,
}
impl Runtime {
    fn new(directory: &Path, timezone: &str) -> Self {
        let initialization = Ledger::initialize(directory, timezone);
        Self {
            directory: directory.into(),
            timezone: timezone.into(),
            ledger: initialization.ledger,
            last_attempt: Instant::now(),
            legacy_source_secured: initialization.legacy_source_secured,
        }
    }
    fn legacy_source_secured(&self) -> bool {
        self.legacy_source_secured
    }
    fn initialize_again(&mut self) -> Result<(), String> {
        self.last_attempt = Instant::now();
        let initialization = Ledger::initialize(&self.directory, &self.timezone);
        self.legacy_source_secured |= initialization.legacy_source_secured;
        self.ledger = initialization.ledger;
        self.ledger.as_ref().map(|_| ()).map_err(Clone::clone)
    }
    fn retry_pending(&mut self) -> Result<bool, String> {
        if self.ledger.is_err() {
            if self.last_attempt.elapsed() < Duration::from_secs(5) {
                return Ok(false);
            }
            self.initialize_again()?;
            return Ok(true);
        }
        self.ledger
            .as_mut()
            .map_err(|error| error.clone())?
            .retry_pending()
    }
}
static RUNTIME: Mutex<Option<Runtime>> = Mutex::new(None);
// Only a confirmed failed initialization means recording is paused. Keep its raw
// error in Runtime for local diagnostics; IPC must expose this anonymous marker.
pub(crate) const STORAGE_UNAVAILABLE: &str = "quota_history_storage_unavailable";
pub fn configure(directory: &Path) -> Result<(), String> {
    let mut runtime = RUNTIME
        .lock()
        .map_err(|_| "Quota history lock unavailable")?;
    // Keep the raw override: an invalid statistics setting falls back to the system zone,
    // independently of the existing Token statistics resolver's UTC behavior.
    if runtime.is_none() {
        *runtime = Some(Runtime::new(
            directory,
            &std::env::var("CODEX_USAGE_TIMEZONE").unwrap_or_default(),
        ));
    } else if runtime
        .as_ref()
        .is_some_and(|runtime| runtime.ledger.is_err())
    {
        // An explicit reconfigure is a local retry, not a permanent cached failure.
        runtime.as_mut().unwrap().initialize_again()?;
    }
    match &runtime.as_ref().unwrap().ledger {
        Ok(_) => Ok(()),
        Err(error) => Err(error.clone()),
    }
}
fn with_ledger<T>(action: impl FnOnce(&mut Ledger) -> Result<T, String>) -> Result<T, String> {
    let mut runtime = RUNTIME
        .lock()
        .map_err(|_| "Quota history lock unavailable")?;
    match runtime.as_mut().map(|r| &mut r.ledger) {
        Some(Ok(ledger)) => action(ledger),
        Some(Err(_)) => Err(STORAGE_UNAVAILABLE.into()),
        None => Err("Quota history is not configured".into()),
    }
}
pub fn recording_enabled() -> bool {
    with_ledger(|l| Ok(l.preferences.enabled)).unwrap_or(false)
}
pub fn get_preferences() -> Result<QuotaRecordingPreferences, String> {
    with_ledger(|l| Ok(l.get_preferences()))
}
pub fn set_enabled(enabled: bool) -> Result<QuotaRecordingPreferences, String> {
    with_ledger(|l| l.set_enabled(enabled))
}
pub fn observe(identity: Option<&str>, limits: &CodexLimitsResponse) -> Result<bool, String> {
    with_ledger(|l| l.observe(identity, limits))
}
pub fn retry_pending() -> Result<bool, String> {
    let mut runtime = RUNTIME
        .lock()
        .map_err(|_| "Quota history lock unavailable")?;
    runtime
        .as_mut()
        .ok_or("Quota history is not configured")?
        .retry_pending()
}
/// The old coach file may be replaced only after its migration source is secured.
pub fn legacy_source_secured() -> bool {
    RUNTIME
        .lock()
        .ok()
        .and_then(|runtime| runtime.as_ref().map(Runtime::legacy_source_secured))
        .unwrap_or(false)
}
pub fn query(identity: Option<&str>, range: &str) -> Result<QuotaHistoryResponse, String> {
    with_ledger(|l| l.query(identity, range))
}
pub fn query_day(
    identity: Option<&str>,
    date: &str,
    kind: &str,
    window_minutes: i64,
    before: Option<i64>,
) -> Result<QuotaHistoryDayResponse, String> {
    with_ledger(|l| l.query_day(identity, date, kind, window_minutes, before))
}
pub fn export_snapshot(
    identity: Option<&str>,
    range: &str,
) -> Result<(QuotaHistoryResponse, Vec<QuotaHistorySegment>), String> {
    with_ledger(|l| l.export_snapshot(identity, range))
}

#[cfg(test)]
mod tests;
