use super::{migration, models::*, preferences::Preferences};
use crate::types::CodexLimitsResponse;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    time::Duration,
};
pub(super) fn valid_identity(identity: &str) -> bool {
    identity.len() == 64 && identity.bytes().all(|b| b.is_ascii_hexdigit())
}
pub(super) fn timestamp(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|d| d.timestamp_millis())
}
pub(super) fn iso(at: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(at)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_default()
}
pub(super) fn date(at: i64, timezone: &str) -> String {
    DateTime::<Utc>::from_timestamp_millis(at)
        .unwrap()
        .with_timezone(&timezone.parse::<chrono_tz::Tz>().unwrap())
        .date_naive()
        .to_string()
}
fn err(error: rusqlite::Error) -> String {
    format!("Quota history storage error: {error}")
}
pub(super) fn open(directory: &Path) -> Result<Connection, String> {
    let path = directory.join("quota-history.db");
    if std::fs::symlink_metadata(&path).is_ok_and(|m| !m.is_file() || m.file_type().is_symlink()) {
        return Err("Quota history must be a regular file".into());
    }
    let existed = path.exists();
    if existed
        && std::fs::metadata(&path)
            .map_err(|_| "Cannot inspect quota history")?
            .len()
            == 0
    {
        return Err("Empty existing quota history; original preserved".into());
    }
    let connection = Connection::open(&path).map_err(err)?;
    connection
        .busy_timeout(Duration::from_millis(250))
        .map_err(err)?;
    let integrity: String = connection
        .query_row("PRAGMA quick_check(1)", [], |r| r.get(0))
        .map_err(err)?;
    if integrity != "ok" {
        return Err("Quota history integrity check failed; original preserved".into());
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if version != 0 && version != 1 {
        return Err("Unsupported quota history schema; original preserved".into());
    }
    if existed && version == 0 {
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        return Err(format!(
            "Unrecognized quota history database ({count} tables); original preserved"
        ));
    }
    if version == 0 {
        connection.execute_batch("BEGIN IMMEDIATE;
        CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE baselines(identity TEXT NOT NULL,kind TEXT NOT NULL,minutes INTEGER NOT NULL,reset INTEGER NOT NULL,at INTEGER NOT NULL,used REAL NOT NULL,epoch INTEGER NOT NULL,cycle INTEGER NOT NULL,last_segment INTEGER NOT NULL,PRIMARY KEY(identity,kind));
        CREATE TABLE segments(id INTEGER PRIMARY KEY AUTOINCREMENT,identity TEXT NOT NULL,kind TEXT NOT NULL,minutes INTEGER NOT NULL,reset INTEGER NOT NULL,cycle INTEGER NOT NULL,date TEXT,start_date TEXT NOT NULL,end_date TEXT NOT NULL,start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,start_used REAL,end_used REAL,consumed REAL,covered REAL NOT NULL,samples INTEGER NOT NULL,reason TEXT NOT NULL,source TEXT NOT NULL);
        CREATE INDEX segments_scope_date ON segments(identity,start_date,end_date);
        CREATE INDEX segments_scope_detail ON segments(identity,kind,minutes,id);
        CREATE TABLE conflicts(identity TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(identity,kind,at));
        PRAGMA user_version=1; COMMIT;").map_err(err)?;
    }
    Ok(connection)
}
struct Baseline {
    minutes: i64,
    reset: i64,
    at: i64,
    used: f64,
    epoch: i64,
    cycle: i64,
    last_segment: i64,
}
pub(super) fn observe(
    connection: &mut Connection,
    identity: &str,
    limits: &CodexLimitsResponse,
    epoch: u64,
    timezone: &str,
) -> Result<bool, String> {
    let Some(at) = timestamp(&limits.updated_at).filter(|at| *at >= 0) else {
        return Ok(false);
    };
    let tx = connection.transaction().map_err(err)?;
    let mut changed = migration::import(&tx, identity, timezone)?;
    if !migration::after_cutover(&tx, identity, at)? {
        tx.commit().map_err(err)?;
        return Ok(changed);
    }
    for (kind, window) in [("session", &limits.session), ("weekly", &limits.weekly)] {
        let Some(window) = window else { continue };
        let Some(minutes) = window
            .window_minutes
            .filter(|m| (1..=5_256_000).contains(m))
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
        let used = window.used_percent;
        if !used.is_finite()
            || !(0.0..=100.0).contains(&used)
            || !window.remaining_percent.is_finite()
            || !(0.0..=100.0).contains(&window.remaining_percent)
            || (used + window.remaining_percent - 100.0).abs() > 0.01
        {
            continue;
        }
        let previous=tx.query_row("SELECT minutes,reset,at,used,epoch,cycle,last_segment FROM baselines WHERE identity=?1 AND kind=?2",params![identity,kind],|r|Ok(Baseline{minutes:r.get(0)?,reset:r.get(1)?,at:r.get(2)?,used:r.get(3)?,epoch:r.get(4)?,cycle:r.get(5)?,last_segment:r.get(6)?})).optional().map_err(err)?;
        if let Some(previous) = &previous {
            if at < previous.at {
                continue;
            }
            if at == previous.at {
                if used != previous.used || minutes != previous.minutes || reset != previous.reset {
                    let inserted = tx
                        .execute(
                            "INSERT OR IGNORE INTO conflicts VALUES(?1,?2,?3)",
                            params![identity, kind, at],
                        )
                        .map_err(err)?;
                    if inserted > 0 {
                        insert(
                            &tx,
                            identity,
                            kind,
                            minutes,
                            reset,
                            previous.cycle,
                            Some(&date(at, timezone)),
                            at,
                            at,
                            Some(previous.used),
                            Some(used),
                            None,
                            0.0,
                            0,
                            "conflict",
                            "official",
                            timezone,
                        )?;
                        changed = true;
                    }
                }
                continue;
            }
        }
        let reason = match &previous {
            None => Some("baseline"),
            Some(p) if p.epoch != epoch as i64 => Some("recording_resumed"),
            Some(p) if p.minutes != minutes || p.reset != reset => Some("cycle_changed"),
            Some(p) if used < p.used => Some("counter_decreased"),
            _ => None,
        };
        let current_date = date(at, timezone);
        let (cycle, last_segment) = if let Some(reason) = reason {
            let id = insert(
                &tx,
                identity,
                kind,
                minutes,
                reset,
                0,
                Some(&current_date),
                at,
                at,
                Some(used),
                Some(used),
                None,
                0.0,
                1,
                reason,
                "official",
                timezone,
            )?;
            tx.execute("UPDATE segments SET cycle=?1 WHERE id=?1", [id])
                .map_err(err)?;
            (id, id)
        } else {
            let p = previous.as_ref().unwrap();
            let same_day = date(p.at, timezone) == current_date;
            let continuous = same_day && at - p.at <= 600_000;
            let reason = if !same_day {
                "cross_day"
            } else if !continuous {
                "same_day_gap"
            } else if used == p.used {
                "unchanged"
            } else {
                "continuous"
            };
            let covered = if continuous {
                (at - p.at) as f64 / 60_000.0
            } else {
                0.0
            };
            let merged = if reason == "unchanged" {
                tx.execute("UPDATE segments SET end_at=?1,end_used=?2,covered=covered+?3,samples=samples+1 WHERE id=?4 AND reason='unchanged' AND end_at=?5",params![at,used,covered,p.last_segment,p.at]).map_err(err)?>0
            } else {
                false
            };
            let id = if merged {
                p.last_segment
            } else {
                insert(
                    &tx,
                    identity,
                    kind,
                    minutes,
                    reset,
                    p.cycle,
                    if same_day { Some(&current_date) } else { None },
                    p.at,
                    at,
                    Some(p.used),
                    Some(used),
                    Some(used - p.used),
                    covered,
                    1,
                    reason,
                    "official",
                    timezone,
                )?
            };
            (p.cycle, id)
        };
        tx.execute("INSERT INTO baselines VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(identity,kind) DO UPDATE SET minutes=excluded.minutes,reset=excluded.reset,at=excluded.at,used=excluded.used,epoch=excluded.epoch,cycle=excluded.cycle,last_segment=excluded.last_segment",params![identity,kind,minutes,reset,at,used,epoch as i64,cycle,last_segment]).map_err(err)?;
        changed = true;
    }
    tx.commit().map_err(err)?;
    Ok(changed)
}
#[allow(clippy::too_many_arguments)]
pub(super) fn insert(
    tx: &Transaction<'_>,
    identity: &str,
    kind: &str,
    minutes: i64,
    reset: i64,
    cycle: i64,
    day: Option<&str>,
    start: i64,
    end: i64,
    start_used: Option<f64>,
    end_used: Option<f64>,
    consumed: Option<f64>,
    covered: f64,
    samples: i64,
    reason: &str,
    source: &str,
    timezone: &str,
) -> Result<i64, String> {
    tx.execute("INSERT INTO segments(identity,kind,minutes,reset,cycle,date,start_date,end_date,start_at,end_at,start_used,end_used,consumed,covered,samples,reason,source) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",params![identity,kind,minutes,reset,cycle,day,date(start,timezone),date(end,timezone),start,end,start_used,end_used,consumed,covered,samples,reason,source]).map_err(err)?;
    Ok(tx.last_insert_rowid())
}
fn range(range: &str, timezone: &str) -> Result<(String, String), String> {
    let (start, end, days) = crate::overview::resolve_range(range, timezone)?;
    if days > 366 {
        return Err("Quota history queries are limited to 366 days".into());
    }
    Ok((start, end))
}
struct Stored {
    segment: QuotaHistorySegment,
    samples: u64,
    start_date: String,
    end_date: String,
}
fn row(row: &Row<'_>) -> rusqlite::Result<Stored> {
    Ok(Stored {
        segment: QuotaHistorySegment {
            id: row.get(0)?,
            kind: row.get(1)?,
            window_minutes: row.get(2)?,
            resets_at: iso(row.get(3)?),
            date: row.get(4)?,
            start_at: iso(row.get(5)?),
            end_at: iso(row.get(6)?),
            start_used_percent: row.get(7)?,
            end_used_percent: row.get(8)?,
            consumed_percent_points: row.get(9)?,
            covered_minutes: row.get(10)?,
            reason: row.get(11)?,
            source: row.get(12)?,
        },
        samples: row.get(14)?,
        start_date: row.get(15)?,
        end_date: row.get(16)?,
    })
}
const COLUMNS:&str="id,kind,minutes,reset,date,start_at,end_at,start_used,end_used,consumed,covered,reason,source,cycle,samples,start_date,end_date";
fn read(
    connection: &Connection,
    identity: Option<&str>,
    start: &str,
    end: &str,
) -> Result<Vec<Stored>, String> {
    let Some(identity) = identity.filter(|s| valid_identity(s)) else {
        return Ok(vec![]);
    };
    let mut statement=connection.prepare(&format!("SELECT {COLUMNS} FROM segments WHERE identity=?1 AND start_date<=?3 AND end_date>=?2 ORDER BY id")).map_err(err)?;
    let rows = statement
        .query_map(params![identity, start, end], row)
        .map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}
pub(super) fn export_segments(
    connection: &Connection,
    identity: Option<&str>,
    input: &str,
    timezone: &str,
) -> Result<Vec<QuotaHistorySegment>, String> {
    let (start, end) = range(input, timezone)?;
    Ok(read(connection, identity, &start, &end)?
        .into_iter()
        .map(|r| r.segment)
        .collect())
}
struct Daily {
    row: QuotaHistoryDaily,
    cycles: BTreeSet<String>,
    intervals: Vec<(i64, i64)>,
}
fn daily_entry<'a>(
    days: &'a mut BTreeMap<(String, String, i64), Daily>,
    date: &str,
    segment: &QuotaHistorySegment,
) -> &'a mut Daily {
    days.entry((date.into(), segment.kind.clone(), segment.window_minutes))
        .or_insert_with(|| Daily {
            row: QuotaHistoryDaily {
                date: date.into(),
                kind: segment.kind.clone(),
                window_minutes: segment.window_minutes,
                consumed_percent_points: None,
                covered_minutes: 0.0,
                sample_count: 0,
                cycle_count: 0,
                gap_count: 0,
                unallocated_count: 0,
                status: "insufficient_samples".into(),
                source: segment.source.clone(),
            },
            cycles: BTreeSet::new(),
            intervals: vec![],
        })
}
fn union_minutes(intervals: &mut [(i64, i64)]) -> f64 {
    intervals.sort_unstable();
    let mut total = 0i64;
    let mut current: Option<(i64, i64)> = None;
    for &(start, end) in intervals.iter() {
        match current {
            Some((a, b)) if start <= b => current = Some((a, b.max(end))),
            Some((a, b)) => {
                total += b - a;
                current = Some((start, end));
            }
            None => current = Some((start, end)),
        }
    }
    if let Some((a, b)) = current {
        total += b - a;
    }
    total as f64 / 60_000.0
}
pub(super) fn query(
    connection: &Connection,
    identity: Option<&str>,
    input: &str,
    preferences: &Preferences,
    status: &str,
) -> Result<QuotaHistoryResponse, String> {
    let (start, end) = range(input, &preferences.timezone)?;
    let stored = read(connection, identity, &start, &end)?;
    let mut days = BTreeMap::new();
    let mut unallocated_count = 0;
    let mut unallocated_by_window: BTreeMap<(String, i64), u64> = BTreeMap::new();
    for stored in stored {
        let segment = &stored.segment;
        if segment.date.is_none() {
            unallocated_count += 1;
            *unallocated_by_window
                .entry((segment.kind.clone(), segment.window_minutes))
                .or_default() += 1;
            let gap_start = stored.start_date.max(start.clone());
            let gap_end = stored.end_date.min(end.clone());
            for day in crate::date::list_date_keys(&gap_start, &gap_end)? {
                let entry = daily_entry(&mut days, &day, segment);
                entry.row.unallocated_count += 1;
                entry.row.gap_count += 1;
                entry.cycles.insert(segment.resets_at.clone());
                if day == date(timestamp(&segment.end_at).unwrap(), &preferences.timezone) {
                    entry.row.sample_count += stored.samples;
                }
            }
            continue;
        }
        let day = segment.date.as_deref().unwrap();
        if day < start.as_str() || day > end.as_str() {
            continue;
        }
        let entry = daily_entry(&mut days, day, segment);
        if segment.reason == "conflict" {
            entry.row.gap_count += 1;
            continue;
        }
        entry.row.sample_count += stored.samples;
        entry.cycles.insert(segment.resets_at.clone());
        if entry.row.source != segment.source {
            entry.row.source = "mixed".into();
        }
        if let Some(value) = segment.consumed_percent_points {
            entry.row.consumed_percent_points =
                Some(entry.row.consumed_percent_points.unwrap_or(0.0) + value);
        }
        if segment.reason == "same_day_gap" {
            entry.row.gap_count += 1;
        }
        if segment.covered_minutes > 0.0 {
            entry.intervals.push((
                timestamp(&segment.start_at).unwrap(),
                timestamp(&segment.end_at).unwrap(),
            ));
        }
    }
    let mut summaries: BTreeMap<(String, i64), QuotaHistorySummary> = BTreeMap::new();
    let daily = days
        .into_values()
        .map(|mut value| {
            value.row.covered_minutes = union_minutes(&mut value.intervals);
            value.row.cycle_count = value.cycles.len() as u64;
            value.row.status = if value.row.source == "coach_migration" {
                "historical_partial"
            } else if value.row.consumed_percent_points == Some(0.0) {
                "unchanged"
            } else if value.row.consumed_percent_points.is_some() {
                "partial"
            } else {
                "insufficient_samples"
            }
            .into();
            let row = &value.row;
            let summary = summaries
                .entry((row.kind.clone(), row.window_minutes))
                .or_insert_with(|| QuotaHistorySummary {
                    kind: row.kind.clone(),
                    window_minutes: row.window_minutes,
                    consumed_percent_points: None,
                    covered_minutes: 0.0,
                    recorded_days: 0,
                    sample_count: 0,
                    gap_count: 0,
                    unallocated_count: 0,
                });
            if let Some(consumed) = row.consumed_percent_points {
                summary.consumed_percent_points =
                    Some(summary.consumed_percent_points.unwrap_or(0.0) + consumed);
                summary.recorded_days += 1;
            }
            summary.covered_minutes += row.covered_minutes;
            summary.sample_count += row.sample_count;
            summary.gap_count += row.gap_count;
            value.row
        })
        .collect();
    for (key, count) in unallocated_by_window {
        if let Some(summary) = summaries.get_mut(&key) {
            summary.unallocated_count = count;
        }
    }
    let updated_at = if let Some(identity) = identity.filter(|s| valid_identity(s)) {
        connection
            .query_row(
                "SELECT MAX(end_at) FROM segments WHERE identity=?1",
                [identity],
                |r| r.get::<_, Option<i64>>(0),
            )
            .map_err(err)?
            .map(iso)
    } else {
        None
    };
    let available = identity.is_some_and(valid_identity);
    Ok(QuotaHistoryResponse {
        schema_version: 1,
        identity_revision: 0,
        scope_available: available,
        timezone: preferences.timezone.clone(),
        enabled: preferences.enabled,
        storage_status: status.into(),
        read_status: if available {
            "ready"
        } else {
            "identity_unavailable"
        }
        .into(),
        updated_at,
        start_date: start,
        end_date: end,
        daily,
        summaries: summaries.into_values().collect(),
        unallocated_count,
    })
}
#[allow(clippy::too_many_arguments)]
pub(super) fn query_day(
    connection: &Connection,
    identity: Option<&str>,
    day: &str,
    kind: &str,
    minutes: i64,
    before: Option<i64>,
    timezone: &str,
    status: &str,
) -> Result<QuotaHistoryDayResponse, String> {
    range(&format!("custom:{day}_{day}"), timezone)?;
    if !["session", "weekly"].contains(&kind)
        || !(1..=5_256_000).contains(&minutes)
        || before.is_some_and(|b| b <= 0)
    {
        return Err("Invalid quota history detail filter".into());
    }
    let available = identity.is_some_and(valid_identity);
    let mut segments = vec![];
    if available {
        let mut statement=connection.prepare(&format!("SELECT {COLUMNS} FROM segments WHERE identity=?1 AND kind=?2 AND minutes=?3 AND ((date=?4) OR (date IS NULL AND start_date<=?4 AND end_date>=?4)) AND id<?5 ORDER BY id DESC LIMIT 101")).map_err(err)?;
        segments = statement
            .query_map(
                params![identity, kind, minutes, day, before.unwrap_or(i64::MAX)],
                row,
            )
            .map_err(err)?
            .map(|r| r.map(|s| s.segment))
            .collect::<Result<_, _>>()
            .map_err(err)?;
    }
    let next_before = if segments.len() > 100 {
        segments.truncate(100);
        segments.last().map(|s| s.id)
    } else {
        None
    };
    Ok(QuotaHistoryDayResponse {
        schema_version: 1,
        identity_revision: 0,
        scope_available: available,
        timezone: timezone.into(),
        storage_status: status.into(),
        read_status: if available {
            "ready"
        } else {
            "identity_unavailable"
        }
        .into(),
        date: day.into(),
        kind: kind.into(),
        window_minutes: minutes,
        segments,
        next_before,
    })
}
