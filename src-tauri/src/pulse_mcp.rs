//! A local, opt-in MCP view of the last Pulse UI snapshot.
//! This mode does not initialize Tauri, scan logs, read credentials, or call a service.
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{LazyLock, Mutex},
};

const SNAPSHOT_NAME: &str = "integration-snapshot.json";
const MAX_MESSAGE: u64 = 64 * 1024;
const MAX_SNAPSHOT: u64 = 64 * 1024;
const MAX_AGE_SECONDS: i64 = 6 * 60;
const RESOURCE_URI: &str = "ui://pulse/panel.html";
const RESOURCE_MIME: &str = "text/html;profile=mcp-app";
static SNAPSHOT_WRITE: Mutex<()> = Mutex::new(());
static ICON_URI: LazyLock<String> = LazyLock::new(|| {
    format!(
        "data:image/png;base64,{}",
        STANDARD.encode(include_bytes!(
            "../../integrations/codex/plugins/codex-pulse/assets/icon.png"
        ))
    )
});

fn icons() -> Value {
    json!([{"src": &*ICON_URI, "mimeType":"image/png", "sizes":["128x128"]}])
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationToday {
    pub date: Option<String>,
    pub timezone: Option<String>,
    pub total_tokens: Option<u64>,
    #[serde(rename = "costUSD")]
    pub cost_usd: Option<f64>,
    pub updated_at: Option<String>,
    pub stale: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationQuota {
    pub kind: String,
    pub window_minutes: Option<u64>,
    pub remaining_percent: Option<f64>,
    pub resets_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pace: Option<crate::pulse_pace::PaceSnapshot>,
    pub schema_version: u8,
    pub application_version: String,
    pub captured_at: Option<String>,
    pub today: IntegrationToday,
    pub quotas: Vec<IntegrationQuota>,
    pub quota_updated_at: Option<String>,
    pub quota_stale: bool,
    pub presentation: Value,
    pub coach: Value,
}

fn limited_text(value: &Value, maximum: usize) -> Option<String> {
    let value = value.as_str()?;
    if value.chars().count() > maximum || value.chars().any(char::is_control) {
        return None;
    }
    (!value.trim().is_empty()).then(|| value.to_string())
}

fn project_presentation(value: &Value) -> Value {
    let language = value["language"]
        .as_str()
        .filter(|text| text.len() <= 64)
        .and_then(|value| {
            let normalized = value.to_lowercase().replace('_', "-");
            if normalized.starts_with("zh-hant")
                || ["zh-tw", "zh-hk", "zh-mo"].iter().any(|prefix| {
                    normalized == *prefix || normalized.starts_with(&format!("{prefix}-"))
                })
            {
                return Some("zh-Hant");
            }
            match normalized.split('-').next()? {
                "zh" => Some("zh"),
                "en" => Some("en"),
                "ja" => Some("ja"),
                "ko" => Some("ko"),
                "de" => Some("de"),
                _ => None,
            }
        });
    let resolved = value["resolvedTheme"]
        .as_str()
        .filter(|value| ["light", "dark"].contains(value));
    json!({"language":language,"resolvedTheme":resolved})
}

fn presentation_preferences(directory: &Path, published: &Value) -> Value {
    let value = (|| -> Option<Value> {
        let file = fs::File::open(directory.join("pulse-preferences.json")).ok()?;
        if file.metadata().ok()?.len() > 16 * 1024 {
            return None;
        }
        serde_json::from_reader(file.take(16 * 1024 + 1)).ok()
    })()
    .unwrap_or(Value::Null);
    let mut result = project_presentation(published);
    result["skinId"] = json!(value["skinId"]
        .as_str()
        .filter(|value| ["clear", "meter"].contains(value)));
    let theme = value["theme"]
        .as_str()
        .filter(|value| ["light", "dark", "system"].contains(value));
    result["theme"] = json!(theme);
    if matches!(theme, Some("light" | "dark")) {
        result["resolvedTheme"] = json!(theme);
    }
    result
}

/// Public global notice only. No notice identity, seen/read flag, account or source payload crosses MCP.
fn project_notice(value: &Value, now: DateTime<Utc>, captured: Option<DateTime<Utc>>) -> Value {
    if stale_at(captured, now)
        || value["verification"] != "third_party"
        || value["scope"] != "global"
    {
        return Value::Null;
    }
    let Some(updated) = timestamp(value.get("updatedAt")) else {
        return Value::Null;
    };
    if !(-120..=300).contains(&now.signed_duration_since(updated).num_seconds()) {
        return Value::Null;
    }
    let Some(published) = timestamp(value.get("publishedAt")) else {
        return Value::Null;
    };
    if published > now || now.signed_duration_since(published).num_days() > 7 {
        return Value::Null;
    }
    let end = timestamp(value.get("endAt"));
    if (value["endAt"].is_string() && end.is_none())
        || end.is_some_and(|end| end <= now || end > now + chrono::Duration::days(7))
        || (end.is_none() && now.signed_duration_since(published).num_seconds() > 86400)
    {
        return Value::Null;
    }
    let start = timestamp(value.get("startAt"));
    if (value["startAt"].is_string() && start.is_none())
        || start.zip(end).is_some_and(|(start, end)| start > end)
    {
        return Value::Null;
    }
    let Some(summary) = limited_text(&value["summary"], 500) else {
        return Value::Null;
    };
    let Some(mut url) = value["sourceUrl"]
        .as_str()
        .filter(|text| text.len() <= 1024 && !text.chars().any(char::is_control))
        .and_then(|text| reqwest::Url::parse(text).ok())
        .filter(|url| {
            url.scheme() == "https"
                && [
                    Some("x.com"),
                    Some("www.x.com"),
                    Some("twitter.com"),
                    Some("www.twitter.com"),
                    Some("openai.com"),
                    Some("www.openai.com"),
                ]
                .contains(&url.host_str())
                && url.username().is_empty()
                && url.password().is_none()
                && url.port().is_none()
        })
    else {
        return Value::Null;
    };
    url.set_fragment(None);
    url.set_query(None);
    json!({"summary":summary,"sourceUrl":url.to_string(),"sourceLabel":"codex-reset.com","startAt":start.map(|value| value.to_rfc3339()),"endAt":end.map(|value| value.to_rfc3339()),"publishedAt":published.to_rfc3339(),"updatedAt":updated.to_rfc3339(),"verification":"third_party","scope":"global"})
}

fn project_observations(value: &Value, pace: &Value, now: DateTime<Utc>) -> Value {
    let empty = json!({"observedWindow":null,"observationTimezone":null,"dailyObservations":[]});
    if stale_at(timestamp(pace.get("updatedAt")), now)
        || matches!(pace["status"].as_str(), Some("stale" | "unavailable"))
    {
        return empty;
    }
    let window = &value["observedWindow"];
    let Some(kind @ ("session" | "weekly")) = window["kind"].as_str() else {
        return empty;
    };
    let Some(minutes) = window["windowMinutes"]
        .as_i64()
        .filter(|value| (1..=5_256_000).contains(value))
    else {
        return empty;
    };
    let Some(reset) = timestamp(window.get("resetsAt")).filter(|reset| *reset > now) else {
        return empty;
    };
    let matching = pace["windows"].as_array().is_some_and(|windows| {
        windows.iter().any(|candidate| {
            candidate["kind"] == kind
                && candidate["windowMinutes"] == minutes
                && timestamp(candidate.get("resetsAt")) == Some(reset)
                && !matches!(
                    candidate["state"].as_str(),
                    Some("stale" | "expired" | "unavailable")
                )
        })
    });
    if !matching {
        return empty;
    }
    let Some(zone) = value["observationTimezone"]
        .as_str()
        .and_then(|text| text.parse::<chrono_tz::Tz>().ok())
    else {
        return empty;
    };
    let first = (reset - chrono::Duration::minutes(minutes))
        .with_timezone(&zone)
        .date_naive();
    let today = now.with_timezone(&zone).date_naive();
    let mut days = Vec::new();
    for row in value["dailyObservations"]
        .as_array()
        .into_iter()
        .flatten()
        .take(32)
    {
        let Some(date) = row["date"]
            .as_str()
            .filter(|text| text.len() == 10)
            .and_then(|text| NaiveDate::parse_from_str(text, "%Y-%m-%d").ok())
            .filter(|date| *date >= first && *date <= today)
        else {
            continue;
        };
        if days
            .iter()
            .any(|day: &Value| day["date"] == date.to_string())
        {
            continue;
        }
        let consumed =
            safe_number(row.get("consumedPercentPoints")).filter(|value| *value <= 100.0);
        let Some(covered) = safe_number(row.get("coveredMinutes")).filter(|value| *value <= 1500.0)
        else {
            continue;
        };
        // The source ledger knows real timezone day boundaries (23/25-hour DST days).
        days.push(json!({"date":date.to_string(),"consumedPercentPoints":consumed,"coveredMinutes":covered,"partial":row["partial"].as_bool().unwrap_or(true)}));
    }
    days.sort_by(|left, right| right["date"].as_str().cmp(&left["date"].as_str()));
    days.truncate(7);
    json!({"observedWindow":{"kind":kind,"windowMinutes":minutes,"resetsAt":reset.to_rfc3339()},"observationTimezone":zone.name(),"dailyObservations":days})
}

fn timestamp(value: Option<&Value>) -> Option<DateTime<Utc>> {
    let text = value?.as_str().filter(|text| text.len() <= 64)?;
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|date| date.with_timezone(&Utc))
}

fn stale_at(date: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    date.is_none_or(|date| {
        let age = now.signed_duration_since(date).num_seconds();
        !(-120..=MAX_AGE_SECONDS).contains(&age)
    })
}

fn safe_number(value: Option<&Value>) -> Option<f64> {
    value?
        .as_f64()
        .filter(|number| number.is_finite() && *number >= 0.0)
}

/// Re-project even a disk snapshot: arbitrary extra fields never cross the MCP boundary.
fn project(
    value: &Value,
    now: DateTime<Utc>,
    captured: Option<DateTime<Utc>>,
) -> IntegrationSnapshot {
    let valid_schema = value.get("schemaVersion").and_then(Value::as_u64) == Some(1);
    let value = if valid_schema { value } else { &Value::Null };
    let today = &value["today"];
    let timezone = today
        .get("timezone")
        .and_then(Value::as_str)
        .filter(|text| text.len() <= 64)
        .and_then(|text| text.parse::<chrono_tz::Tz>().ok());
    let date = today
        .get("date")
        .and_then(Value::as_str)
        .filter(|text| text.len() == 10)
        .and_then(|text| NaiveDate::parse_from_str(text, "%Y-%m-%d").ok());
    let is_today = timezone
        .zip(date)
        .is_some_and(|(timezone, date)| now.with_timezone(&timezone).date_naive() == date);
    let today_updated = timestamp(today.get("updatedAt"));
    let quota_updated = timestamp(value.get("quotaUpdatedAt"));
    let capture_stale = stale_at(captured, now);
    let mut quota_stale = value
        .get("quotaStale")
        .and_then(Value::as_bool)
        .unwrap_or(true)
        || capture_stale
        || stale_at(quota_updated, now);
    let mut quotas = Vec::new();
    if let Some(windows) = value.get("quotas").and_then(Value::as_array) {
        for window in windows.iter().take(8) {
            let Some(kind @ ("session" | "weekly")) = window.get("kind").and_then(Value::as_str)
            else {
                continue;
            };
            if quotas
                .iter()
                .any(|existing: &IntegrationQuota| existing.kind == kind)
            {
                continue;
            }
            let resets_at = timestamp(window.get("resetsAt"));
            let expired = resets_at.is_some_and(|date| date <= now);
            quota_stale |= expired;
            let remaining = window
                .get("remainingPercent")
                .and_then(Value::as_f64)
                .filter(|number| number.is_finite())
                .map(|number| number.clamp(0.0, 100.0));
            quotas.push(IntegrationQuota {
                kind: kind.into(),
                window_minutes: window
                    .get("windowMinutes")
                    .and_then(Value::as_u64)
                    .filter(|minutes| (1..=5_256_000).contains(minutes)),
                remaining_percent: if expired { None } else { remaining },
                resets_at: resets_at.map(|date| date.to_rfc3339()),
            });
        }
    }
    IntegrationSnapshot {
        pace: None,
        schema_version: 1,
        application_version: env!("CARGO_PKG_VERSION").into(),
        captured_at: captured.map(|date| date.to_rfc3339()),
        today: IntegrationToday {
            date: date.map(|date| date.format("%Y-%m-%d").to_string()),
            timezone: timezone.map(|timezone| timezone.name().into()),
            total_tokens: if is_today {
                today
                    .get("totalTokens")
                    .and_then(Value::as_u64)
                    .filter(|number| *number <= 9_007_199_254_740_991)
            } else {
                None
            },
            cost_usd: if is_today {
                safe_number(today.get("costUSD"))
            } else {
                None
            },
            updated_at: today_updated.map(|date| date.to_rfc3339()),
            stale: !is_today
                || capture_stale
                || stale_at(today_updated, now)
                || today.get("stale").and_then(Value::as_bool).unwrap_or(true),
        },
        quotas,
        quota_updated_at: quota_updated.map(|date| date.to_rfc3339()),
        quota_stale,
        presentation: project_presentation(&value["presentation"]),
        coach: json!({"observedWindow":null,"observationTimezone":null,"dailyObservations":[],"resetNotice":null}),
    }
}

/// Best effort export; the widget command keeps working when its optional integration file cannot be written.
pub fn publish_widget_snapshot(data: &Value, directory: &Path) {
    let Some(value) = data.get("integration") else {
        return;
    };
    let Ok(_guard) = SNAPSHOT_WRITE.lock() else {
        return;
    };
    let now = Utc::now();
    let mut snapshot = project(value, now, Some(now));
    let pace = crate::pulse_pace::read_snapshot(directory, now);
    let extras = serde_json::to_value(crate::pulse_coach::extras(directory, &pace, now))
        .unwrap_or(Value::Null);
    snapshot.coach["resetNotice"] = project_notice(&extras["resetNotice"], now, Some(now));
    let Ok(bytes) = serde_json::to_vec(&snapshot) else {
        return;
    };
    if bytes.len() as u64 > MAX_SNAPSHOT {
        return;
    }
    let temporary = directory.join(format!(
        ".integration-snapshot-{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let published = directory.join(SNAPSHOT_NAME);
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &published)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
}

pub fn read_snapshot(directory: &Path) -> IntegrationSnapshot {
    let now = Utc::now();
    let value = (|| -> Option<Value> {
        let file = fs::File::open(directory.join(SNAPSHOT_NAME)).ok()?;
        if file.metadata().ok()?.len() > MAX_SNAPSHOT {
            return None;
        }
        let mut bytes = Vec::new();
        file.take(MAX_SNAPSHOT + 1).read_to_end(&mut bytes).ok()?;
        if bytes.len() as u64 > MAX_SNAPSHOT {
            return None;
        }
        serde_json::from_slice(&bytes).ok()
    })()
    .unwrap_or(Value::Null);
    let captured = timestamp(value.get("capturedAt"));
    let mut snapshot = project(&value, now, captured);
    let pace = crate::pulse_pace::read_snapshot(directory, now);
    // This function reads only the local, identity-matched ledger. MCP does not configure or
    // start the coach worker, read credentials, mark notices read or fetch announcements.
    let extras = serde_json::to_value(crate::pulse_coach::extras(directory, &pace, now))
        .unwrap_or(Value::Null);
    snapshot.coach = project_observations(
        &extras,
        &serde_json::to_value(&pace).unwrap_or(Value::Null),
        now,
    );
    snapshot.coach["resetNotice"] = project_notice(
        if value["schemaVersion"] == 1 {
            &value["coach"]["resetNotice"]
        } else {
            &Value::Null
        },
        now,
        captured,
    );
    snapshot.presentation = presentation_preferences(directory, &snapshot.presentation);
    snapshot.pace = Some(pace);
    snapshot
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum OpenTarget {
    Main,
    Widget,
    Details,
}

fn launch(executable: &Path, directory: &Path, target: OpenTarget) -> Result<(), String> {
    let mut command = Command::new(executable);
    command
        .env("PULSE_DATA_DIR", directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    if target == OpenTarget::Widget {
        command.arg("--show-widget");
    }
    if target == OpenTarget::Details {
        command.arg("--show-pace-details");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|_| "Pulse could not open its desktop window.".into())
}

fn tools() -> Value {
    json!({"tools": [
        {
            "name":"pulse_usage", "title":"Codex Pulse",
            "icons": icons(),
            "description":"View the last local Pulse usage and account-window snapshot. Does not scan conversations, read credentials, activate models, or contact account services.",
            "inputSchema":{"type":"object","properties":{},"additionalProperties":false},
            "annotations":{"readOnlyHint":true,"destructiveHint":false,"openWorldHint":false},
            "_meta":{"ui":{"resourceUri":RESOURCE_URI,"visibility":["app"]},
                "openai/ui":{"entrypoints":[{"type":"global","header":{"enabled":true}},{"type":"thread"}]}}
        },
        {
            "name":"pulse_open", "title":"Open Pulse desktop",
            "description":"Open the Pulse desktop workspace, floating widget, or quota/observation details on this computer.",
            "inputSchema":{"type":"object","properties":{"target":{"type":"string","enum":["main","widget","details"]}},"required":["target"],"additionalProperties":false},
            "annotations":{"readOnlyHint":false,"destructiveHint":false,"openWorldHint":false},
            "_meta":{"ui":{"visibility":["app"]}}
        }
    ]})
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}

fn dispatch(
    request: Value,
    directory: &Path,
    initialized: &mut bool,
    open: &mut impl FnMut(OpenTarget) -> Result<(), String>,
) -> Option<Value> {
    let id = request.get("id")?.clone();
    if !(id.is_null() || id.is_string() || id.is_i64() || id.is_u64())
        || id.as_str().is_some_and(|text| text.len() > 256)
    {
        return Some(rpc_error(
            Value::Null,
            -32600,
            "Invalid request identifier.",
        ));
    }
    if request.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Some(rpc_error(id, -32600, "JSON-RPC 2.0 is required."));
    }
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return Some(rpc_error(id, -32600, "A method is required."));
    };
    if method != "initialize" && method != "ping" && !*initialized {
        return Some(rpc_error(id, -32002, "Initialize the server first."));
    }
    let params = request.get("params").unwrap_or(&Value::Null);
    let result = match method {
        "initialize" => {
            let requested = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("");
            let protocol =
                if ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"].contains(&requested) {
                    requested
                } else {
                    "2025-11-25"
                };
            *initialized = true;
            json!({"protocolVersion":protocol,"capabilities":{"tools":{},"resources":{}},
                "serverInfo":{"name":"codex-pulse","version":env!("CARGO_PKG_VERSION"),"title":"Codex Pulse", "icons":icons()}})
        }
        "ping" => json!({}),
        "tools/list" => tools(),
        "resources/list" => {
            json!({"resources":[{"uri":RESOURCE_URI,"name":"Pulse","mimeType":RESOURCE_MIME,"description":"Local Pulse usage panel"}]})
        }
        "resources/templates/list" => json!({"resourceTemplates":[]}),
        "resources/read" if params.get("uri").and_then(Value::as_str) == Some(RESOURCE_URI) => {
            json!({
                "contents":[{"uri":RESOURCE_URI,"mimeType":RESOURCE_MIME,
                    "text":include_str!("../../src/pulse/integration/panel.html").replace("__PULSE_VERSION__", env!("CARGO_PKG_VERSION")).replace("__PULSE_ICON__", &ICON_URI).replace("__PULSE_COPY__", include_str!("../../src/pulse/integration/panel-copy.json")),
                    "_meta":{"ui":{"csp":{"connectDomains":[],"resourceDomains":[]}}}}]
            })
        }
        "resources/read" => return Some(rpc_error(id, -32602, "Unknown resource.")),
        "tools/call" => {
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match params.get("name").and_then(Value::as_str) {
                Some("pulse_usage")
                    if arguments.as_object().is_some_and(|args| args.is_empty()) =>
                {
                    let snapshot = read_snapshot(directory);
                    json!({"content":[{"type":"text","text":"Pulse local usage snapshot. Missing values are unavailable; stale values require refreshing in the desktop app."}],
                        "structuredContent":snapshot})
                }
                Some("pulse_open") => {
                    let args = arguments.as_object();
                    let target = match args
                        .and_then(|args| args.get("target"))
                        .and_then(Value::as_str)
                    {
                        Some("main") => Some(OpenTarget::Main),
                        Some("widget") => Some(OpenTarget::Widget),
                        Some("details") => Some(OpenTarget::Details),
                        _ => None,
                    };
                    if args.is_none_or(|args| args.len() != 1) || target.is_none() {
                        return Some(rpc_error(
                            id,
                            -32602,
                            "Target must be main, widget or details.",
                        ));
                    }
                    match open(target.unwrap()) {
                        Ok(()) => {
                            json!({"content":[{"type":"text","text":"Pulse desktop window requested."}],"structuredContent":{"opened":true}})
                        }
                        Err(_) => {
                            json!({"isError":true,"content":[{"type":"text","text":"Pulse could not open its desktop window."}]})
                        }
                    }
                }
                Some("pulse_usage") => {
                    return Some(rpc_error(id, -32602, "This view accepts an empty object."))
                }
                _ => return Some(rpc_error(id, -32602, "Unknown tool.")),
            }
        }
        _ => return Some(rpc_error(id, -32601, "Unknown method.")),
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

fn serve(
    mut input: impl BufRead,
    mut output: impl Write,
    directory: &Path,
    mut open: impl FnMut(OpenTarget) -> Result<(), String>,
) -> std::io::Result<()> {
    let mut initialized = false;
    loop {
        let mut bytes = Vec::new();
        let read = input
            .by_ref()
            .take(MAX_MESSAGE + 1)
            .read_until(b'\n', &mut bytes)?;
        if read == 0 {
            return Ok(());
        }
        let response = if read as u64 > MAX_MESSAGE {
            Some(rpc_error(
                Value::Null,
                -32600,
                "Message exceeds the local integration limit.",
            ))
        } else if bytes.iter().all(u8::is_ascii_whitespace) {
            continue;
        } else {
            match serde_json::from_slice::<Value>(&bytes) {
                Ok(request) => dispatch(request, directory, &mut initialized, &mut open),
                Err(_) => Some(rpc_error(Value::Null, -32700, "Invalid JSON.")),
            }
        };
        if let Some(response) = response {
            serde_json::to_writer(&mut output, &response)?;
            output.write_all(b"\n")?;
            output.flush()?;
        }
        if read as u64 > MAX_MESSAGE {
            return Ok(());
        }
    }
}

/// Must run before path preparation, logging plugins, single-instance forwarding, or WebView creation.
pub fn run_if_requested() -> bool {
    if !std::env::args().any(|argument| argument == "--mcp") {
        return false;
    }
    let result = (|| -> Result<(), String> {
        let executable = std::env::current_exe().map_err(|_| "Cannot locate Pulse.")?;
        let directory = crate::pulse_desktop::resolve_data_path(
            std::env::var_os("PULSE_DATA_DIR").map(PathBuf::from),
            &executable,
            cfg!(debug_assertions),
        )?;
        serve(
            std::io::stdin().lock(),
            std::io::stdout().lock(),
            &directory,
            |target| launch(&executable, &directory, target),
        )
        .map_err(|_| "Local integration connection ended.".to_string())
    })();
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn time() -> DateTime<Utc> {
        "2026-11-08T05:00:00Z".parse().unwrap()
    }
    fn source() -> Value {
        json!({"schemaVersion":1,"capturedAt":"2026-11-08T05:00:00Z",
            "account":"must-not-export","workspace":"must-not-export","auth":{"token":"must-not-export"},
            "today":{"date":"2026-11-08","timezone":"Asia/Shanghai","totalTokens":13600,"costUSD":0.04,
                "updatedAt":"2026-11-08T04:59:00Z","stale":false,"body":"must-not-export"},
            "quotas":[{"kind":"session","windowMinutes":300,"remainingPercent":72.25,"resetsAt":"2026-11-08T06:00:00Z","account":"must-not-export"},
                {"kind":"weekly","windowMinutes":10080,"remainingPercent":59,"resetsAt":"2026-11-12T05:00:00Z"}],
            "quotaUpdatedAt":"2026-11-08T04:59:00Z","quotaStale":false})
    }
    #[test]
    fn projection_retains_only_local_summary_and_raw_account_window_numbers() {
        let snapshot = project(&source(), time(), Some(time()));
        let text = serde_json::to_string(&snapshot).unwrap();
        assert!(!text.contains("must-not-export"));
        assert_eq!(snapshot.today.total_tokens, Some(13600));
        assert_eq!(snapshot.quotas[0].remaining_percent, Some(72.25));
        assert!(!snapshot.today.stale);
        assert!(!snapshot.quota_stale);
    }
    #[test]
    fn midnight_age_expiry_and_unknowns_do_not_invent_current_usage_or_reset_capacity() {
        let mut value = source();
        value["today"]["date"] = json!("2026-11-07");
        value["quotas"][0]["resetsAt"] = json!("2026-11-08T04:00:00Z");
        let snapshot = project(&value, time(), Some(time() - chrono::Duration::minutes(7)));
        assert_eq!(snapshot.today.total_tokens, None);
        assert_eq!(snapshot.today.cost_usd, None);
        assert_eq!(snapshot.quotas[0].remaining_percent, None);
        assert!(snapshot.today.stale);
        assert!(snapshot.quota_stale);
        let unknown = project(&Value::Null, time(), None);
        assert!(unknown.quotas.is_empty());
        assert_eq!(unknown.today.total_tokens, None);
    }
    #[test]
    fn malformed_numbers_and_duplicate_or_unknown_windows_are_filtered() {
        let mut value = source();
        value["today"]["totalTokens"] = json!(-1);
        value["today"]["costUSD"] = json!(-1);
        value["quotas"][0]["remainingPercent"] = json!(110);
        value["quotas"][0]["windowMinutes"] = json!(-1);
        value["quotas"]
            .as_array_mut()
            .unwrap()
            .push(json!({"kind":"session","remainingPercent":0}));
        value["quotas"]
            .as_array_mut()
            .unwrap()
            .push(json!({"kind":"account-address","remainingPercent":3}));
        let snapshot = project(&value, time(), Some(time()));
        assert_eq!(snapshot.today.total_tokens, None);
        assert_eq!(snapshot.today.cost_usd, None);
        assert_eq!(snapshot.quotas.len(), 2);
        assert_eq!(snapshot.quotas[0].remaining_percent, Some(100.0));
        assert_eq!(snapshot.quotas[0].window_minutes, None);
    }
    #[test]
    fn rpc_has_official_entrypoints_and_three_controlled_open_targets() {
        let mut initialized = false;
        let mut called = Vec::new();
        let mut open = |target| {
            called.push(target);
            Ok(())
        };
        let initialized_result = dispatch(json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}), Path::new("missing"), &mut initialized, &mut open).unwrap();
        assert_eq!(
            initialized_result["result"]["protocolVersion"],
            "2025-06-18"
        );
        let listed = dispatch(
            json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
            Path::new("missing"),
            &mut initialized,
            &mut open,
        )
        .unwrap();
        assert_eq!(
            listed["result"]["tools"][0]["_meta"]["openai/ui"]["entrypoints"][0]["type"],
            "global"
        );
        assert_eq!(
            listed["result"]["tools"][0]["_meta"]["openai/ui"]["entrypoints"][0]["header"]
                ["enabled"],
            true
        );
        let resource = dispatch(
            json!({"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":RESOURCE_URI}}),
            Path::new("missing"),
            &mut initialized,
            &mut open,
        )
        .unwrap();
        let html = resource["result"]["contents"][0]["text"].as_str().unwrap();
        assert!(!html.contains("__PULSE_VERSION__"));
        assert!(!html.contains("__PULSE_ICON__"));
        assert!(!html.contains("__PULSE_COPY__"));
        assert!(html.contains("Follow Pulse") && html.contains("Pulse folgen"));
        assert!(html.contains("data:image/png;base64,"));
        assert_eq!(
            initialized_result["result"]["serverInfo"]["icons"][0]["src"],
            listed["result"]["tools"][0]["icons"][0]["src"]
        );
        let denied = dispatch(json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pulse_open","arguments":{"target":"shell","command":"ignored"}}}), Path::new("missing"), &mut initialized, &mut open).unwrap();
        assert_eq!(denied["error"]["code"], -32602);
        dispatch(
            json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"pulse_open","arguments":{"target":"widget"}}}),
            Path::new("missing"),
            &mut initialized,
            &mut open,
        );
        dispatch(
            json!({"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"pulse_open","arguments":{"target":"details"}}}),
            Path::new("missing"),
            &mut initialized,
            &mut open,
        );
        assert_eq!(called, vec![OpenTarget::Widget, OpenTarget::Details]);
    }
    #[test]
    fn stdio_ignores_notifications_and_bounds_invalid_input_without_echoing_it() {
        let input = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\"}}\n{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\nnot-private-input\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}\n";
        let mut output = Vec::new();
        serve(
            Cursor::new(input),
            &mut output,
            Path::new("missing"),
            |_| panic!("must not open"),
        )
        .unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(!text.contains("not-private-input"));
        assert_eq!(text.lines().count(), 3);
        let mut output = Vec::new();
        serve(
            Cursor::new(vec![b'x'; MAX_MESSAGE as usize + 1]),
            &mut output,
            Path::new("missing"),
            |_| panic!("must not open"),
        )
        .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&output).unwrap()["error"]["code"],
            -32600
        );
    }
    #[test]
    fn persisted_file_is_replaced_and_reprojected_without_exposing_extra_fields() {
        let directory = std::env::temp_dir().join(format!("pulse-mcp-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        publish_widget_snapshot(&json!({"integration":source()}), &directory);
        publish_widget_snapshot(&json!({"integration":source()}), &directory);
        let text = fs::read_to_string(directory.join(SNAPSHOT_NAME)).unwrap();
        assert!(!text.contains("must-not-export"));
        let mut stored: Value = serde_json::from_str(&text).unwrap();
        stored["account"] = json!("must-not-export");
        fs::write(
            directory.join(SNAPSHOT_NAME),
            serde_json::to_vec(&stored).unwrap(),
        )
        .unwrap();
        assert!(!serde_json::to_string(&read_snapshot(&directory))
            .unwrap()
            .contains("must-not-export"));
        fs::remove_file(directory.join(SNAPSHOT_NAME)).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    fn folder() -> PathBuf {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.local/tests")
            .join(format!("pulse-mcp-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }
    fn notice(now: DateTime<Utc>) -> Value {
        json!({"id":"must-not-export","isUnread":true,"account":"must-not-export","summary":"Public reset watch","sourceUrl":"https://x.com/OpenAI/status/123?tracking=1#ignored","sourceLabel":"must-not-export","publishedAt":(now-chrono::Duration::minutes(1)).to_rfc3339(),"updatedAt":now.to_rfc3339(),"startAt":(now+chrono::Duration::hours(1)).to_rfc3339(),"endAt":(now+chrono::Duration::hours(2)).to_rfc3339(),"verification":"third_party","scope":"global"})
    }
    #[test]
    fn public_notice_projection_strips_private_fields_and_rejects_unsafe_or_expired_values() {
        let original = notice(time());
        let projected = project_notice(&original, time(), Some(time()));
        assert_eq!(projected["sourceUrl"], "https://x.com/OpenAI/status/123");
        assert!(!projected.is_null());
        assert!(!projected.to_string().contains("must-not-export"));
        for url in [
            "javascript:alert(1)",
            "https://x.com.evil.invalid/1",
            "https://user:secret@x.com/1",
            "http://x.com/1",
            "https://x.com:8443/1",
        ] {
            let mut invalid = original.clone();
            invalid["sourceUrl"] = json!(url);
            assert!(
                project_notice(&invalid, time(), Some(time())).is_null(),
                "{url}"
            );
        }
        let mut invalid = original.clone();
        invalid["sourceUrl"] = json!(format!("https://x.com/{}", "a".repeat(1024)));
        assert!(project_notice(&invalid, time(), Some(time())).is_null());
        let mut invalid = original.clone();
        invalid["endAt"] = json!((time() - chrono::Duration::seconds(1)).to_rfc3339());
        assert!(project_notice(&invalid, time(), Some(time())).is_null());
        let mut invalid = original.clone();
        invalid["updatedAt"] = json!((time() - chrono::Duration::seconds(301)).to_rfc3339());
        assert!(project_notice(&invalid, time(), Some(time())).is_null());
        assert!(project_notice(
            &original,
            time(),
            Some(time() - chrono::Duration::minutes(7))
        )
        .is_null());
    }
    #[test]
    fn presentation_is_canonical_and_invalid_preferences_do_not_reuse_an_old_followed_style() {
        let path = folder();
        let published = json!({"language":"zh-CN","resolvedTheme":"light","skinId":"old-private-style","account":"must-not-export"});
        fs::write(
            path.join("pulse-preferences.json"),
            r#"{"skinId":"meter","theme":"dark","private":"must-not-export"}"#,
        )
        .unwrap();
        let value = presentation_preferences(&path, &published);
        assert_eq!(value["language"], "zh");
        assert_eq!(value["skinId"], "meter");
        assert_eq!(value["resolvedTheme"], "dark");
        assert!(!value.to_string().contains("must-not-export"));
        fs::write(path.join("pulse-preferences.json"), b"invalid").unwrap();
        let value = presentation_preferences(&path, &published);
        assert!(value["skinId"].is_null());
        assert!(value["theme"].is_null());
        assert_eq!(
            project_presentation(&json!({"language":"zh-TW"}))["language"],
            "zh-Hant"
        );
        assert_eq!(
            project_presentation(&json!({"language":"de-DE"}))["language"],
            "de"
        );
        assert!(project_presentation(
            &json!({"language":"must-not-export","resolvedTheme":"private"})
        )["language"]
            .is_null());
        fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn observations_require_the_exact_window_and_keep_dst_coverage_without_identity_fields() {
        let now: DateTime<Utc> = "2026-11-02T18:00:00Z".parse().unwrap();
        let reset = (now + chrono::Duration::days(2)).to_rfc3339();
        let pace = json!({"status":"sampling","updatedAt":now.to_rfc3339(),"windows":[{"kind":"weekly","windowMinutes":10080,"resetsAt":reset,"state":"sampling"}]});
        let mut extras = json!({"identityHash":"must-not-export","observedWindow":{"kind":"weekly","windowMinutes":10080,"resetsAt":reset,"account":"must-not-export"},"observationTimezone":"America/New_York","dailyObservations":[{"date":"2026-11-01","consumedPercentPoints":0,"coveredMinutes":1500,"partial":true,"body":"must-not-export"}]});
        let value = project_observations(&extras, &pace, now);
        assert_eq!(value["dailyObservations"][0]["coveredMinutes"], 1500.0);
        assert_eq!(value["dailyObservations"][0]["consumedPercentPoints"], 0.0);
        assert!(!value.to_string().contains("must-not-export"));
        extras["observedWindow"]["resetsAt"] =
            json!((now - chrono::Duration::seconds(1)).to_rfc3339());
        assert_eq!(
            project_observations(&extras, &pace, now)["dailyObservations"],
            json!([])
        );
        extras["observedWindow"]["resetsAt"] = json!(reset);
        extras["observedWindow"]["windowMinutes"] = json!(300);
        assert_eq!(
            project_observations(&extras, &pace, now)["dailyObservations"],
            json!([])
        );
    }
    fn write_scope_fixture(
        path: &Path,
        now: DateTime<Utc>,
        identity: &str,
        ledger_identity: &str,
        ledger_reset: i64,
    ) {
        let at = now.timestamp();
        let reset = at + 7 * 86400;
        fs::write(path.join("quota-pace.json"),serde_json::to_vec(&json!({"schemaVersion":1,"identityHash":identity,"updatedAt":at,"failed":false,"reason":null,"windows":[{"kind":"weekly","windowMinutes":10080,"resetsAt":reset,"points":[{"at":at-60,"used":20},{"at":at,"used":21}]}]})).unwrap()).unwrap();
        fs::write(path.join("coach-observations.json"),serde_json::to_vec(&json!({"schemaVersion":1,"identityHash":ledger_identity,"cycles":[{"kind":"weekly","windowMinutes":10080,"resetsAt":ledger_reset,"timezone":"UTC","last":{"at":at,"used":21},"days":[{"date":now.date_naive().to_string(),"consumed":1,"intervals":[{"start":at-60,"end":at}]}]}]})).unwrap()).unwrap();
    }
    #[test]
    fn mcp_reuses_only_the_current_local_scope_even_when_other_accounts_have_identical_window_times(
    ) {
        let path = folder();
        let now = Utc::now();
        let first = "a".repeat(64);
        let second = "b".repeat(64);
        let reset = now.timestamp() + 7 * 86400;
        write_scope_fixture(&path, now, &first, &first, reset);
        let before = fs::read(path.join("coach-observations.json")).unwrap();
        let snapshot = read_snapshot(&path);
        assert!(!snapshot.coach["dailyObservations"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(!serde_json::to_string(&snapshot).unwrap().contains(&first));
        write_scope_fixture(&path, now, &second, &first, reset);
        let snapshot = read_snapshot(&path);
        assert_eq!(snapshot.coach["dailyObservations"], json!([]));
        assert!(snapshot.coach["observedWindow"].is_null());
        write_scope_fixture(&path, now, &first, &first, reset + 3600);
        assert_eq!(read_snapshot(&path).coach["dailyObservations"], json!([]));
        // Neither the MCP read nor scope matching rewrites the source ledger.
        write_scope_fixture(&path, now, &first, &first, reset);
        let _ = read_snapshot(&path);
        assert_eq!(
            fs::read(path.join("coach-observations.json")).unwrap(),
            before
        );
        fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn unknown_source_schema_cannot_reintroduce_a_well_formed_published_notice() {
        let path = folder();
        let now = Utc::now();
        let value = json!({"schemaVersion":99,"capturedAt":now.to_rfc3339(),"coach":{"resetNotice":notice(now),"dailyObservations":[{"date":"private-date"}],"identityHash":"must-not-export"}});
        fs::write(
            path.join(SNAPSHOT_NAME),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap();
        let snapshot = read_snapshot(&path);
        assert!(snapshot.coach["resetNotice"].is_null());
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("must-not-export"));
        fs::remove_dir_all(path).unwrap();
    }
}
