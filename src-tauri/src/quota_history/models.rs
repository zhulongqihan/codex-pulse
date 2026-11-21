//! Anonymous IPC contract. Times are RFC3339 UTC; pagination cursors are SQLite IDs.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaRecordingPreferences {
    pub schema_version: u8,
    pub enabled: bool,
    pub timezone: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistoryDaily {
    pub date: String,
    pub kind: String,
    pub window_minutes: i64,
    pub consumed_percent_points: Option<f64>,
    pub covered_minutes: f64,
    pub sample_count: u64,
    pub cycle_count: u64,
    pub gap_count: u64,
    pub unallocated_count: u64,
    /// partial | unchanged | insufficient_samples | historical_partial
    pub status: String,
    /// official | coach_migration | mixed
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistorySummary {
    pub kind: String,
    pub window_minutes: i64,
    pub consumed_percent_points: Option<f64>,
    pub covered_minutes: f64,
    pub recorded_days: u64,
    pub sample_count: u64,
    pub gap_count: u64,
    pub unallocated_count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistoryResponse {
    pub schema_version: u8,
    pub identity_revision: u64,
    pub scope_available: bool,
    /// Presence only. Details and totals always use the verified current identity.
    #[serde(default)]
    pub has_other_scope_history: bool,
    pub timezone: String,
    pub enabled: bool,
    /// ready | write_failed | preferences_error | unavailable
    pub storage_status: String,
    /// Official provider only: ready | identity_unavailable | read_failed.
    /// Local query failures are IPC errors, not a successful response's status.
    pub read_status: String,
    pub updated_at: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub daily: Vec<QuotaHistoryDaily>,
    pub summaries: Vec<QuotaHistorySummary>,
    pub unallocated_count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistorySegment {
    pub id: i64,
    pub kind: String,
    pub window_minutes: i64,
    pub resets_at: String,
    pub date: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub start_used_percent: Option<f64>,
    pub end_used_percent: Option<f64>,
    pub consumed_percent_points: Option<f64>,
    pub covered_minutes: f64,
    /// baseline | continuous | unchanged | same_day_gap | cross_day |
    /// counter_decreased | cycle_changed | recording_resumed | conflict | historical_partial
    pub reason: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuotaHistoryDayResponse {
    pub schema_version: u8,
    pub identity_revision: u64,
    pub scope_available: bool,
    pub timezone: String,
    pub storage_status: String,
    /// Official provider status, independent of local query or write failures.
    pub read_status: String,
    pub date: String,
    pub kind: String,
    pub window_minutes: i64,
    pub segments: Vec<QuotaHistorySegment>,
    pub next_before: Option<i64>,
}
