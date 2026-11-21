//! Official quota observations have their own export; tokens and prices never enter it.
use crate::quota_history::{QuotaHistoryResponse, QuotaHistorySegment};
use crate::types::ExportResponse;
use chrono::Utc;
use rust_xlsxwriter::{Format, Workbook};
use std::path::Path;

pub(crate) fn export(
    history: &QuotaHistoryResponse,
    segments: &[QuotaHistorySegment],
    range: &str,
    format: &str,
    path: &Path,
) -> Result<ExportResponse, String> {
    match format {
        "markdown" => std::fs::write(path, render_markdown(history, segments))
            .map_err(|_| "Could not save quota history Markdown")?,
        "xlsx" => write_xlsx(history, segments, path)?,
        _ => return Err("Unsupported quota history export format".into()),
    }
    Ok(ExportResponse {
        path: path.to_string_lossy().into_owned(),
        format: format.into(),
        range: range.into(),
        exported_at: Utc::now().to_rfc3339(),
    })
}

fn render_markdown(history: &QuotaHistoryResponse, segments: &[QuotaHistorySegment]) -> String {
    let mut output = format!("# Official quota observations\n\nScope: current account and selected source (anonymous).\n\nTimezone: {}\n\nRange: {} — {}\n\nRead status: {}. Storage status: {}. Recording enabled: {}.\n\nValues are observed percentage points, not a complete bill. Unknown values are blank. Cross-day changes are unallocated and excluded from daily sums.\n\n",
        history.timezone, history.start_date, history.end_date, history.read_status, history.storage_status, history.enabled);
    for table in tables(history, segments) {
        output.push_str(&format!(
            "## {}\n\n| {} |\n| {} |\n",
            table.title,
            table.headers.join(" | "),
            table
                .headers
                .iter()
                .map(|_| "---")
                .collect::<Vec<_>>()
                .join(" | ")
        ));
        for row in table.rows {
            output.push_str(&format!(
                "| {} |\n",
                row.iter()
                    .map(Cell::markdown)
                    .collect::<Vec<_>>()
                    .join(" | ")
            ));
        }
        output.push('\n');
    }
    output
}

enum Cell {
    Text(String),
    Number(Option<f64>),
}
impl Cell {
    fn text(value: impl Into<String>) -> Self {
        Self::Text(value.into())
    }
    fn number(value: f64) -> Self {
        Self::Number(Some(value))
    }
    fn markdown(&self) -> String {
        match self {
            Self::Text(value) => value.replace('|', "\\|").replace(['\n', '\r'], " "),
            Self::Number(None) => String::new(),
            Self::Number(Some(value)) => format!("{value:.6}")
                .trim_end_matches('0')
                .trim_end_matches('.')
                .to_string(),
        }
    }
}
struct Table {
    name: &'static str,
    title: &'static str,
    headers: &'static [&'static str],
    rows: Vec<Vec<Cell>>,
}

fn segment_row(row: &QuotaHistorySegment) -> Vec<Cell> {
    vec![
        Cell::text(&row.kind),
        Cell::number(row.window_minutes as f64),
        Cell::text(&row.resets_at),
        Cell::text(row.date.as_deref().unwrap_or("")),
        Cell::text(&row.start_at),
        Cell::text(&row.end_at),
        Cell::Number(row.start_used_percent),
        Cell::Number(row.end_used_percent),
        Cell::Number(row.consumed_percent_points),
        Cell::number(row.covered_minutes),
        Cell::text(&row.reason),
        Cell::text(&row.source),
    ]
}
fn tables(history: &QuotaHistoryResponse, segments: &[QuotaHistorySegment]) -> Vec<Table> {
    const SEGMENTS: &[&str] = &[
        "Kind",
        "Window minutes",
        "Reset UTC",
        "Assigned date",
        "Start UTC",
        "End UTC",
        "Start used percent",
        "End used percent",
        "Observed pp",
        "Covered minutes",
        "Reason",
        "Source",
    ];
    vec![
        Table {
            name: "Summary",
            title: "Recorded part of daily observations",
            headers: &[
                "Kind",
                "Window minutes",
                "Observed pp",
                "Covered minutes",
                "Recorded days",
                "Samples",
                "Gaps",
                "Unallocated segments",
            ],
            rows: history
                .summaries
                .iter()
                .map(|r| {
                    vec![
                        Cell::text(&r.kind),
                        Cell::number(r.window_minutes as f64),
                        Cell::Number(r.consumed_percent_points),
                        Cell::number(r.covered_minutes),
                        Cell::number(r.recorded_days as f64),
                        Cell::number(r.sample_count as f64),
                        Cell::number(r.gap_count as f64),
                        Cell::number(r.unallocated_count as f64),
                    ]
                })
                .collect(),
        },
        Table {
            name: "Daily",
            title: "Daily observations",
            headers: &[
                "Date",
                "Kind",
                "Window minutes",
                "Observed pp",
                "Covered minutes",
                "Samples",
                "Cycles",
                "Gaps",
                "Unallocated segments",
                "Status",
                "Source",
            ],
            rows: history
                .daily
                .iter()
                .map(|r| {
                    vec![
                        Cell::text(&r.date),
                        Cell::text(&r.kind),
                        Cell::number(r.window_minutes as f64),
                        Cell::Number(r.consumed_percent_points),
                        Cell::number(r.covered_minutes),
                        Cell::number(r.sample_count as f64),
                        Cell::number(r.cycle_count as f64),
                        Cell::number(r.gap_count as f64),
                        Cell::number(r.unallocated_count as f64),
                        Cell::text(&r.status),
                        Cell::text(&r.source),
                    ]
                })
                .collect(),
        },
        Table {
            name: "Segments",
            title: "Assigned cycle segments",
            headers: SEGMENTS,
            rows: segments
                .iter()
                .filter(|r| r.date.is_some())
                .map(segment_row)
                .collect(),
        },
        Table {
            name: "Unallocated",
            title: "Cross-day unallocated changes",
            headers: SEGMENTS,
            rows: segments
                .iter()
                .filter(|r| r.date.is_none())
                .map(segment_row)
                .collect(),
        },
        Table {
            name: "Coverage",
            title: "Observed coverage intervals",
            headers: &[
                "Kind",
                "Window minutes",
                "Assigned date",
                "Start UTC",
                "End UTC",
                "Covered minutes",
                "Source",
            ],
            rows: segments
                .iter()
                .filter(|r| r.covered_minutes > 0.0)
                .map(|r| {
                    vec![
                        Cell::text(&r.kind),
                        Cell::number(r.window_minutes as f64),
                        Cell::text(r.date.as_deref().unwrap_or("")),
                        Cell::text(&r.start_at),
                        Cell::text(&r.end_at),
                        Cell::number(r.covered_minutes),
                        Cell::text(&r.source),
                    ]
                })
                .collect(),
        },
    ]
}

fn write_xlsx(
    history: &QuotaHistoryResponse,
    segments: &[QuotaHistorySegment],
    path: &Path,
) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let heading = Format::new().set_bold();
    let number = Format::new().set_num_format("0.######");
    for table in tables(history, segments) {
        let sheet = workbook.add_worksheet();
        let write = |_: rust_xlsxwriter::XlsxError| {
            "Could not prepare quota history spreadsheet".to_string()
        };
        sheet.set_name(table.name).map_err(write)?;
        sheet
            .set_column_range_width(0, (table.headers.len() - 1) as u16, 22)
            .map_err(write)?;
        sheet
            .write_string(
                0,
                0,
                "Official quota observations (percentage points; partial)",
            )
            .map_err(write)?;
        sheet
            .write_string(
                1,
                0,
                format!(
                    "Timezone: {}; range: {} — {}; anonymous current account/source",
                    history.timezone, history.start_date, history.end_date
                ),
            )
            .map_err(write)?;
        sheet.write_string(2, 0, format!("Read: {}; storage: {}; unknown cells blank; cross-day changes excluded from daily totals", history.read_status, history.storage_status)).map_err(write)?;
        for (column, label) in table.headers.iter().enumerate() {
            sheet
                .write_with_format(4, column as u16, *label, &heading)
                .map_err(write)?;
        }
        for (index, cells) in table.rows.iter().enumerate() {
            let row = u32::try_from(index + 5)
                .map_err(|_| "Quota export exceeds spreadsheet row limits")?;
            for (column, cell) in cells.iter().enumerate() {
                match cell {
                    Cell::Text(value) => {
                        sheet
                            .write_string(row, column as u16, value)
                            .map_err(write)?;
                    }
                    Cell::Number(Some(value)) => {
                        sheet
                            .write_number_with_format(row, column as u16, *value, &number)
                            .map_err(write)?;
                    }
                    Cell::Number(None) => {}
                }
            }
        }
        sheet.set_freeze_panes(5, 0).map_err(write)?;
    }
    workbook
        .save(path)
        .map_err(|_| "Could not save quota history spreadsheet".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quota_history::{QuotaHistoryDaily, QuotaHistorySummary};

    fn fixture() -> (QuotaHistoryResponse, Vec<QuotaHistorySegment>) {
        let history = QuotaHistoryResponse {
            schema_version: 1,
            identity_revision: 7,
            scope_available: true,
            has_other_scope_history: true,
            timezone: "Asia/Shanghai".into(),
            enabled: true,
            storage_status: "ready".into(),
            read_status: "ready".into(),
            updated_at: Some("2026-11-15T01:00:00Z".into()),
            start_date: "2026-11-14".into(),
            end_date: "2026-11-15".into(),
            daily: vec![
                QuotaHistoryDaily {
                    date: "2026-11-14".into(),
                    kind: "session".into(),
                    window_minutes: 300,
                    consumed_percent_points: None,
                    covered_minutes: 0.0,
                    sample_count: 1,
                    cycle_count: 1,
                    gap_count: 0,
                    unallocated_count: 1,
                    status: "insufficient_samples".into(),
                    source: "official".into(),
                },
                QuotaHistoryDaily {
                    date: "2026-11-15".into(),
                    kind: "session".into(),
                    window_minutes: 300,
                    consumed_percent_points: Some(150.0),
                    covered_minutes: 20.0,
                    sample_count: 8,
                    cycle_count: 2,
                    gap_count: 1,
                    unallocated_count: 1,
                    status: "partial".into(),
                    source: "official".into(),
                },
            ],
            summaries: vec![QuotaHistorySummary {
                kind: "session".into(),
                window_minutes: 300,
                consumed_percent_points: Some(150.0),
                covered_minutes: 20.0,
                recorded_days: 1,
                sample_count: 9,
                gap_count: 1,
                unallocated_count: 1,
            }],
            unallocated_count: 1,
        };
        let segments = vec![QuotaHistorySegment {
            id: 9,
            kind: "session".into(),
            window_minutes: 300,
            resets_at: "2026-11-15T04:00:00Z".into(),
            date: None,
            start_at: "2026-11-14T15:59:00Z".into(),
            end_at: "2026-11-14T16:01:00Z".into(),
            start_used_percent: Some(20.0),
            end_used_percent: Some(28.0),
            consumed_percent_points: Some(8.0),
            covered_minutes: 0.0,
            reason: "cross_day".into(),
            source: "official".into(),
        }];
        (history, segments)
    }

    #[test]
    fn markdown_keeps_unknown_blank_and_cross_day_changes_out_of_daily_totals() {
        let (history, segments) = fixture();
        let output = render_markdown(&history, &segments);
        assert!(output.contains("Asia/Shanghai"));
        assert!(output.contains("| 2026-11-14 | session | 300 |  |"));
        assert!(output.contains("| 2026-11-15 | session | 300 | 150 |"));
        assert!(output.contains("## Cross-day unallocated changes"));
        assert!(output.contains("| 20 | 28 | 8 | 0 | cross_day |"));
        assert!(!output.contains("15000%"));
        assert!(!output.contains("Total Tokens"));
        assert!(!output.contains("Cost USD"));
    }

    #[test]
    fn legacy_unknown_endpoints_remain_empty_and_anonymous() {
        let (history, mut segments) = fixture();
        segments[0].start_used_percent = None;
        segments[0].end_used_percent = None;
        segments[0].date = Some("2026-11-14".into());
        segments[0].reason = "historical_partial".into();
        segments[0].source = "coach_migration".into();
        let output = render_markdown(&history, &segments);
        assert!(output.contains("|  |  | 8 | 0 | historical_partial | coach_migration |"));
        assert!(!output.contains("identityRevision"));
        assert!(!output.contains("account_id"));
    }

    #[test]
    fn supported_file_export_writes_markdown_and_rejects_unknown_formats() {
        let (history, segments) = fixture();
        let directory = std::env::temp_dir().join(format!("quota-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("quota.md");
        let result = export(&history, &segments, "2d", "markdown", &path).unwrap();
        assert_eq!(result.range, "2d");
        assert_eq!(result.format, "markdown");
        assert!(std::fs::read_to_string(&path).unwrap().contains("150"));
        assert!(export(&history, &segments, "2d", "csv", &directory.join("bad.csv")).is_err());
        assert!(!directory.join("bad.csv").exists());
        std::fs::remove_dir_all(directory).unwrap();
    }

    /// Explicit local evidence only: no accounts, network, or real application data.
    /// Set QUOTA_HISTORY_EVIDENCE_DIR to a fresh directory on F: and run with --ignored.
    #[test]
    #[ignore = "opt-in synthetic XLSX readback and 35-day history timing evidence"]
    fn synthetic_xlsx_readback_and_dense_history_evidence_worker() {
        use crate::quota_history::Ledger;
        use crate::types::{CodexLimitWindow, CodexLimitsResponse};
        use chrono::{Duration, TimeZone};
        use std::time::Instant;

        let directory = std::path::PathBuf::from(
            std::env::var_os("QUOTA_HISTORY_EVIDENCE_DIR")
                .expect("set QUOTA_HISTORY_EVIDENCE_DIR to a fresh synthetic evidence directory"),
        );
        assert!(directory.is_absolute());
        assert!(directory
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with("f:"));
        assert!(
            !directory.exists(),
            "preserve existing attempts; choose a new directory"
        );
        std::fs::create_dir_all(&directory).unwrap();
        println!("synthetic evidence directory: {}", directory.display());

        let (history, segments) = fixture();
        let fixture_export_started = Instant::now();
        export(
            &history,
            &segments,
            "2d",
            "xlsx",
            &directory.join("quota-fixture.xlsx"),
        )
        .unwrap();
        let fixture_xlsx_ms = fixture_export_started.elapsed().as_secs_f64() * 1000.0;
        std::fs::write(
            directory.join("quota-fixture.json"),
            serde_json::to_vec_pretty(&serde_json::json!({
                "history": history, "segments": segments,
            }))
            .unwrap(),
        )
        .unwrap();

        const IDENTITY: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
        const OBSERVATIONS: i64 = 35 * 24 * 12;
        const STEP_MS: i64 = 5 * 60_000;
        let timezone: chrono_tz::Tz = "Asia/Shanghai".parse().unwrap();
        let today = Utc::now().with_timezone(&timezone).date_naive();
        let first_day = today - Duration::days(35);
        let base = timezone
            .from_local_datetime(&first_day.and_hms_opt(0, 0, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&Utc);
        let iso = |milliseconds| {
            chrono::DateTime::<Utc>::from_timestamp_millis(milliseconds)
                .unwrap()
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        };
        let ledger_directory = directory.join("synthetic-ledger");
        let open_started = Instant::now();
        let mut ledger = Ledger::open(&ledger_directory, "Asia/Shanghai").unwrap();
        let open_ms = open_started.elapsed().as_secs_f64() * 1000.0;
        let seed_started = Instant::now();
        for index in 0..OBSERVATIONS {
            let window = |minutes: i64| {
                let steps = minutes / 5;
                let used = (index % steps) as f64 * 100.0 / (steps - 1) as f64;
                CodexLimitWindow {
                    used_percent: used,
                    remaining_percent: 100.0 - used,
                    window_minutes: Some(minutes),
                    resets_at: Some(iso(
                        base.timestamp_millis() + (index / steps + 1) * steps * STEP_MS
                    )),
                }
            };
            let limits = CodexLimitsResponse {
                identity_revision: None,
                session: Some(window(300)),
                weekly: Some(window(10_080)),
                credits: None,
                credits_is_mock: false,
                reset_credits_available_count: None,
                reset_credits: None,
                updated_at: iso(base.timestamp_millis() + index * STEP_MS),
                source: "oauth".into(),
                account: Some("synthetic-account-sentinel@example.invalid".into()),
                membership_level: None,
                workspace_name: None,
                subscription_expires_at: None,
                subscription_will_renew: None,
            };
            assert!(ledger.observe(Some(IDENTITY), &limits).unwrap());
            if (index + 1) % 2_016 == 0 {
                println!(
                    "seeded {} of {} observations ({:.3}s)",
                    index + 1,
                    OBSERVATIONS,
                    seed_started.elapsed().as_secs_f64()
                );
            }
        }
        let seed_ms = seed_started.elapsed().as_secs_f64() * 1000.0;
        let query_started = Instant::now();
        let queried = ledger.query(Some(IDENTITY), "365d").unwrap();
        let query_365d_ms = query_started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(queried.daily.len(), 70);
        assert_eq!(queried.summaries.len(), 2);
        let snapshot_started = Instant::now();
        let (snapshot, all_segments) = ledger.export_snapshot(Some(IDENTITY), "365d").unwrap();
        let export_snapshot_ms = snapshot_started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(snapshot, queried);
        assert_eq!(all_segments.len(), (OBSERVATIONS * 2) as usize);
        let dense_xlsx_started = Instant::now();
        export(
            &snapshot,
            &all_segments,
            "365d",
            "xlsx",
            &directory.join("quota-dense.xlsx"),
        )
        .unwrap();
        let dense_xlsx_ms = dense_xlsx_started.elapsed().as_secs_f64() * 1000.0;
        let snapshot_json = serde_json::to_vec_pretty(&serde_json::json!({
            "history": snapshot, "segments": all_segments,
        }))
        .unwrap();
        assert!(!String::from_utf8_lossy(&snapshot_json).contains(IDENTITY));
        assert!(!String::from_utf8_lossy(&snapshot_json).contains("synthetic-account-sentinel"));
        std::fs::write(directory.join("quota-dense.json"), snapshot_json).unwrap();
        drop(ledger);
        let database_bytes = std::fs::metadata(ledger_directory.join("quota-history.db"))
            .unwrap()
            .len();
        let reopen_started = Instant::now();
        let reopened = Ledger::open(&ledger_directory, "UTC").unwrap();
        let reopen_ms = reopen_started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(reopened.get_preferences().timezone, "Asia/Shanghai");
        assert_eq!(reopened.query(Some(IDENTITY), "365d").unwrap(), queried);
        drop(reopened);
        let measurements = serde_json::json!({
            "syntheticOnly": true, "buildProfile": "debug/test", "queryRange": "365d",
            "sampleDays": 35, "observationCalls": OBSERVATIONS,
            "windowReadings": OBSERVATIONS * 2, "sampleStepMinutes": 5,
            "sessionWindowMinutes": 300, "weeklyWindowMinutes": 10_080,
            "startAt": base.to_rfc3339(),
            "endAt": iso(base.timestamp_millis() + (OBSERVATIONS - 1) * STEP_MS),
            "dailyRows": queried.daily.len(), "summaryRows": queried.summaries.len(),
            "segments": all_segments.len(), "unallocatedSegments": queried.unallocated_count,
            "databaseBytes": database_bytes, "openMs": open_ms, "seedMs": seed_ms,
            "query365dMs": query_365d_ms, "exportSnapshotMs": export_snapshot_ms,
            "fixtureXlsxMs": fixture_xlsx_ms, "denseXlsxMs": dense_xlsx_ms, "reopenMs": reopen_ms,
            "timingPolicy": "measurements only; no performance pass threshold",
        });
        std::fs::write(
            directory.join("worker-measurements.json"),
            serde_json::to_vec_pretty(&measurements).unwrap(),
        )
        .unwrap();
        println!("{}", serde_json::to_string(&measurements).unwrap());
    }
}
