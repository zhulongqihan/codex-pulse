//! Freeze bounded legacy input before coach writes. Import and marker share one transaction.
use super::store;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, fs, io::Read, path::Path};
const LIMIT: u64 = 512 * 1024;
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Legacy {
    schema_version: u8,
    identity_hash: Option<String>,
    cycles: Vec<Cycle>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Cycle {
    kind: String,
    window_minutes: i64,
    resets_at: i64,
    timezone: String,
    last: Sample,
    days: Vec<Day>,
}
#[derive(Deserialize, Serialize)]
struct Sample {
    at: i64,
    used: f64,
}
#[derive(Deserialize, Serialize)]
struct Day {
    date: String,
    consumed: f64,
    intervals: Vec<Interval>,
}
#[derive(Deserialize, Serialize)]
struct Interval {
    start: i64,
    end: i64,
}
fn error(e: rusqlite::Error) -> String {
    format!("Cannot migrate quota history: {e}")
}
pub(super) fn source_absent(directory: &Path) -> bool {
    fs::symlink_metadata(directory.join("coach-observations.json"))
        .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
}
pub(super) fn freeze(connection: &Connection, directory: &Path) -> Result<(), String> {
    if connection
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-frozen'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?
        .is_some()
    {
        return Ok(());
    }
    let target = directory.join("coach-observations.json");
    let snapshot = match fs::symlink_metadata(&target) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return Err("Cannot freeze old coach observations".into()),
        Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > LIMIT => {
            String::new()
        }
        Ok(_) => {
            let mut bytes = vec![];
            fs::File::open(&target)
                .and_then(|f| f.take(LIMIT + 1).read_to_end(&mut bytes))
                .map_err(|_| "Cannot freeze old coach observations")?;
            if bytes.len() as u64 > LIMIT {
                String::new()
            } else {
                String::from_utf8(bytes).unwrap_or_default()
            }
        }
    };
    // Persist only the validated old schema. Extra fields can never smuggle credentials into SQLite.
    let snapshot = serde_json::from_str::<Legacy>(&snapshot)
        .ok()
        .filter(valid)
        .and_then(|legacy| serde_json::to_string(&legacy).ok())
        .unwrap_or_default();
    let tx = connection.unchecked_transaction().map_err(error)?;
    tx.execute(
        "INSERT INTO meta VALUES('migration-v1-frozen',?1)",
        [snapshot],
    )
    .map_err(error)?;
    tx.execute(
        "INSERT INTO meta VALUES('migration-v1-cutover',?1)",
        [Utc::now().timestamp_millis().to_string()],
    )
    .map_err(error)?;
    tx.commit().map_err(error)
}
pub(super) fn import(tx: &Transaction<'_>, identity: &str, timezone: &str) -> Result<bool, String> {
    if tx
        .query_row("SELECT value FROM meta WHERE key='migration-v1'", [], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .map_err(error)?
        .is_some()
    {
        return Ok(false);
    }
    let snapshot: String = tx
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-frozen'",
            [],
            |r| r.get(0),
        )
        .map_err(error)?;
    let legacy = serde_json::from_str::<Legacy>(&snapshot).ok().filter(valid);
    let Some(legacy) = legacy else {
        tx.execute("INSERT INTO meta VALUES('migration-v1','skipped')", [])
            .map_err(error)?;
        return Ok(false);
    };
    if legacy.identity_hash.as_deref() != Some(identity)
        || legacy.cycles.iter().any(|c| c.timezone != timezone)
    {
        return Ok(false);
    }
    for cycle in legacy.cycles {
        let mut cycle_id = 0;
        for day in cycle.days {
            let mut intervals = day.intervals.iter();
            if let Some(first) = intervals.next() {
                let id = store::insert(
                    tx,
                    identity,
                    &cycle.kind,
                    cycle.window_minutes,
                    cycle.resets_at * 1000,
                    cycle_id,
                    Some(&day.date),
                    first.start * 1000,
                    first.end * 1000,
                    None,
                    None,
                    Some(day.consumed),
                    (first.end - first.start) as f64 / 60.0,
                    0,
                    "historical_partial",
                    "coach_migration",
                    timezone,
                )?;
                if cycle_id == 0 {
                    cycle_id = id;
                    tx.execute("UPDATE segments SET cycle=?1 WHERE id=?1", [id])
                        .map_err(error)?;
                }
                // Each actual interval remains separate; never fill the gaps between them.
                for interval in intervals {
                    store::insert(
                        tx,
                        identity,
                        &cycle.kind,
                        cycle.window_minutes,
                        cycle.resets_at * 1000,
                        cycle_id,
                        Some(&day.date),
                        interval.start * 1000,
                        interval.end * 1000,
                        None,
                        None,
                        None,
                        (interval.end - interval.start) as f64 / 60.0,
                        0,
                        "historical_partial",
                        "coach_migration",
                        timezone,
                    )?;
                }
            } else {
                let zone = timezone.parse::<chrono_tz::Tz>().unwrap();
                let local = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d")
                    .unwrap()
                    .and_hms_opt(12, 0, 0)
                    .unwrap();
                let at = zone
                    .from_local_datetime(&local)
                    .earliest()
                    .ok_or("Cannot place historical day")?
                    .timestamp_millis();
                let id = store::insert(
                    tx,
                    identity,
                    &cycle.kind,
                    cycle.window_minutes,
                    cycle.resets_at * 1000,
                    cycle_id,
                    Some(&day.date),
                    at,
                    at,
                    None,
                    None,
                    Some(day.consumed),
                    0.0,
                    0,
                    "historical_partial",
                    "coach_migration",
                    timezone,
                )?;
                if cycle_id == 0 {
                    cycle_id = id;
                    tx.execute("UPDATE segments SET cycle=?1 WHERE id=?1", [id])
                        .map_err(error)?;
                }
            }
        }
    }
    tx.execute("INSERT INTO meta VALUES('migration-v1','imported')", [])
        .map_err(error)?;
    tx.execute(
        "INSERT INTO meta VALUES('migration-v1-owner',?1)",
        [identity],
    )
    .map_err(error)?;
    Ok(true)
}
pub(super) fn after_cutover(tx: &Transaction<'_>, identity: &str, at: i64) -> Result<bool, String> {
    let owner = tx
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-owner'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?;
    if owner.as_deref() != Some(identity) {
        return Ok(true);
    }
    let cutover = tx
        .query_row(
            "SELECT value FROM meta WHERE key='migration-v1-cutover'",
            [],
            |r| r.get::<_, String>(0),
        )
        .map_err(error)?;
    let cutover = cutover
        .parse::<i64>()
        .map_err(|_| "Invalid persisted quota migration cutover")?;
    Ok(at > cutover)
}
fn valid(legacy: &Legacy) -> bool {
    legacy.schema_version == 1
        && legacy
            .identity_hash
            .as_deref()
            .is_some_and(store::valid_identity)
        && legacy.cycles.len() <= 2
        && legacy
            .cycles
            .iter()
            .map(|c| &c.kind)
            .collect::<BTreeSet<_>>()
            .len()
            == legacy.cycles.len()
        && legacy.cycles.iter().all(|c| {
            ["session", "weekly"].contains(&c.kind.as_str())
                && (1..=5_256_000).contains(&c.window_minutes)
                && DateTime::from_timestamp(c.resets_at, 0)
                    .is_some_and(|_| c.resets_at <= i64::MAX / 1000)
                && c.last.at >= 0
                && c.last.at < c.resets_at
                && c.last.used.is_finite()
                && (0.0..=100.0).contains(&c.last.used)
                && c.timezone.parse::<chrono_tz::Tz>().is_ok()
                && c.days.len() <= 31
                && c.days
                    .iter()
                    .map(|d| &d.date)
                    .collect::<BTreeSet<_>>()
                    .len()
                    == c.days.len()
                && c.days.iter().all(|d| {
                    NaiveDate::parse_from_str(&d.date, "%Y-%m-%d").is_ok()
                        && d.consumed.is_finite()
                        && (0.0..=100.0).contains(&d.consumed)
                        && d.intervals.len() <= 256
                        && d.intervals.iter().all(|i| {
                            i.start >= 0
                                && i.end > i.start
                                && i.end <= c.last.at
                                && store::date(i.start * 1000, &c.timezone) == d.date
                                && store::date(i.end * 1000, &c.timezone) == d.date
                        })
                        && d.intervals.windows(2).all(|w| w[0].end <= w[1].start)
                })
        })
}
