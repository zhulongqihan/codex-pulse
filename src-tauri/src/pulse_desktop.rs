//! Codex Pulse portable paths, shared preferences, and the independent widget.
//! The usage engine and tray state are shared by all three webviews.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct WidgetSnapshot(pub Mutex<Option<serde_json::Value>>);

#[tauri::command]
pub fn get_widget_snapshot(
    state: tauri::State<'_, WidgetSnapshot>,
) -> Result<Option<serde_json::Value>, String> {
    state
        .0
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "Widget state unavailable".into())
}

#[tauri::command]
pub fn update_widget_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, WidgetSnapshot>,
    data: serde_json::Value,
) -> Result<(), String> {
    *state.0.lock().map_err(|_| "Widget state unavailable")? = Some(data.clone());
    if let Some(paths) = app.try_state::<PulsePaths>() {
        crate::pulse_mcp::publish_widget_snapshot(&data, &paths.data);
    }
    app.emit_to("widget", "widget-snapshot-updated", data)
        .map_err(|error| error.to_string())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PulsePaths {
    pub data: PathBuf,
    pub logs: PathBuf,
    pub profile: PathBuf,
    pub temporary: PathBuf,
    pub exports: PathBuf,
}

pub fn resolve_data_path(
    override_path: Option<PathBuf>,
    executable: &Path,
    development: bool,
) -> Result<PathBuf, String> {
    if let Some(path) = override_path {
        if !path.is_absolute() {
            return Err("PULSE_DATA_DIR must be an absolute writable directory".into());
        }
        return Ok(path);
    }
    if development {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Missing project directory")?
            .join(".local/data"));
    }
    Ok(executable
        .parent()
        .ok_or("Missing executable directory")?
        .join("data"))
}

/// Called before Tauri, WebView2, HTTP clients, or worker threads start.
pub fn prepare_paths() -> Result<PulsePaths, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let requested = std::env::var_os("PULSE_DATA_DIR").map(PathBuf::from);
    #[cfg(feature = "e2e")]
    let requested =
        requested.or_else(|| std::env::var_os("CODEX_USAGE_TEST_DATA_DIR").map(PathBuf::from));
    let data = resolve_data_path(requested, &executable, cfg!(debug_assertions))?;
    let paths = PulsePaths {
        logs: data.join("logs"),
        profile: data.join("webview"),
        temporary: data.join("tmp"),
        exports: data.join("exports"),
        data,
    };
    for path in [
        &paths.data,
        &paths.logs,
        &paths.profile,
        &paths.temporary,
        &paths.exports,
    ] {
        fs::create_dir_all(path).map_err(|error| {
            format!("Cannot create Pulse directory {}: {error}", path.display())
        })?;
    }
    let probe = paths
        .temporary
        .join(format!("write-probe-{}", std::process::id()));
    fs::write(&probe, b"Codex Pulse")
        .map_err(|error| format!("Pulse data directory is not writable: {error}"))?;
    fs::remove_file(&probe).map_err(|error| error.to_string())?;
    for name in ["TEMP", "TMP", "TMPDIR"] {
        std::env::set_var(name, &paths.temporary);
    }
    // Also protect WebView2 subprocesses from a profile fallback to %LOCALAPPDATA%.
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &paths.profile);
    Ok(paths)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct PulsePreferences {
    pub skin_id: String,
    pub theme: String,
    pub motion_level: String,
    pub compact_mode: bool,
    pub respect_reduced_motion: bool,
    pub widget_visible: bool,
    pub widget_expanded: bool,
    pub widget_always_on_top: bool,
    pub widget_x: Option<i32>,
    pub widget_y: Option<i32>,
}

impl Default for PulsePreferences {
    fn default() -> Self {
        Self {
            skin_id: "clear".into(),
            theme: "system".into(),
            motion_level: "gentle".into(),
            compact_mode: false,
            respect_reduced_motion: true,
            widget_visible: false,
            widget_expanded: false,
            widget_always_on_top: true,
            widget_x: None,
            widget_y: None,
        }
    }
}

pub struct PreferenceStore {
    pub value: Mutex<PulsePreferences>,
    path: PathBuf,
    legacy: Option<LegacyPreferences>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LegacyPreferences {
    pub language: Option<String>,
    pub refresh_minutes: Option<u64>,
    pub launch_at_login: Option<bool>,
}

fn migrate_legacy(value: &serde_json::Value) -> (PulsePreferences, LegacyPreferences) {
    let mut preferences = PulsePreferences::default();
    for (key, allowed, destination) in [
        ("skinId", &["clear", "meter"][..], &mut preferences.skin_id),
        (
            "theme",
            &["system", "light", "dark"][..],
            &mut preferences.theme,
        ),
        (
            "motionLevel",
            &["off", "gentle", "full"][..],
            &mut preferences.motion_level,
        ),
    ] {
        if let Some(text) = value
            .get(key)
            .and_then(serde_json::Value::as_str)
            .filter(|text| allowed.contains(text))
        {
            *destination = text.into();
        }
    }
    for (key, destination) in [
        ("compactMode", &mut preferences.compact_mode),
        (
            "respectReducedMotion",
            &mut preferences.respect_reduced_motion,
        ),
        ("widgetVisible", &mut preferences.widget_visible),
        ("widgetExpanded", &mut preferences.widget_expanded),
    ] {
        if let Some(flag) = value.get(key).and_then(serde_json::Value::as_bool) {
            *destination = flag;
        }
    }
    if value
        .get("reducedMotion")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
    {
        preferences.motion_level = "off".into();
    }
    preferences.widget_x = value
        .pointer("/widgetPosition/x")
        .and_then(serde_json::Value::as_i64)
        .and_then(|n| i32::try_from(n).ok());
    preferences.widget_y = value
        .pointer("/widgetPosition/y")
        .and_then(serde_json::Value::as_i64)
        .and_then(|n| i32::try_from(n).ok());
    let language = value
        .get("language")
        .and_then(serde_json::Value::as_str)
        .filter(|language| ["zh", "en"].contains(language))
        .map(str::to_owned);
    let refresh_minutes = value
        .get("refreshSeconds")
        .and_then(serde_json::Value::as_u64)
        .filter(|seconds| [60, 120, 300, 600].contains(seconds))
        .map(|seconds| seconds / 60);
    let legacy = LegacyPreferences {
        language,
        refresh_minutes,
        launch_at_login: value
            .get("launchAtLogin")
            .and_then(serde_json::Value::as_bool),
    };
    (preferences, legacy)
}

impl PreferenceStore {
    pub fn load(data: &Path) -> Self {
        let path = data.join("pulse-preferences.json");
        let legacy_path = data.join("pulse-legacy-preferences.json");
        if !path.exists() {
            if let Some(legacy) = fs::read(data.join("settings.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            {
                let (migrated, legacy_preferences) = migrate_legacy(&legacy);
                // Never rewrite the Electron file. Unknown fields and executable paths stay there.
                if let (Ok(preferences), Ok(imported)) = (
                    serde_json::to_vec_pretty(&migrated),
                    serde_json::to_vec_pretty(&legacy_preferences),
                ) {
                    if fs::write(&legacy_path, imported)
                        .and_then(|_| fs::write(&path, preferences))
                        .is_err()
                    {
                        log::warn!("Could not persist migrated Pulse preferences");
                    }
                }
            }
        }
        let value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PulsePreferences>(&bytes).ok())
            .filter(|value| validate_preferences(value).is_ok())
            .unwrap_or_default();
        Self {
            value: Mutex::new(value),
            path,
            legacy: fs::read(legacy_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok()),
        }
    }
}

#[tauri::command]
pub fn get_legacy_preferences(
    state: tauri::State<'_, PreferenceStore>,
) -> Option<LegacyPreferences> {
    state.legacy.clone()
}

fn validate_preferences(value: &PulsePreferences) -> Result<(), String> {
    if !["clear", "meter"].contains(&value.skin_id.as_str()) {
        return Err("Unsupported skin".into());
    }
    if !["system", "light", "dark"].contains(&value.theme.as_str()) {
        return Err("Unsupported color mode".into());
    }
    if !["off", "gentle", "full"].contains(&value.motion_level.as_str()) {
        return Err("Unsupported motion level".into());
    }
    Ok(())
}

fn merged_preferences(
    current: &PulsePreferences,
    patch: serde_json::Value,
) -> Result<PulsePreferences, String> {
    let patch = patch
        .as_object()
        .ok_or("Preference patch must be an object")?;
    let mut value = serde_json::to_value(current).map_err(|error| error.to_string())?;
    for (key, entry) in patch {
        value[key] = entry.clone();
    }
    let updated: PulsePreferences =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    validate_preferences(&updated)?;
    Ok(updated)
}

#[tauri::command]
pub fn get_pulse_preferences(
    state: tauri::State<'_, PreferenceStore>,
) -> Result<PulsePreferences, String> {
    state
        .value
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "Preference lock unavailable".into())
}

#[tauri::command]
pub fn set_pulse_preferences(
    app: tauri::AppHandle,
    state: tauri::State<'_, PreferenceStore>,
    patch: serde_json::Value,
) -> Result<PulsePreferences, String> {
    let mut saved = state
        .value
        .lock()
        .map_err(|_| "Preference lock unavailable")?;
    let updated = merged_preferences(&saved, patch)?;
    let temporary = state.path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&updated).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&temporary, &state.path).map_err(|error| error.to_string())?;
    *saved = updated.clone();
    drop(saved);
    apply_widget(&app, &updated)?;
    app.emit("pulse-preferences-changed", &updated)
        .map_err(|error| error.to_string())?;
    Ok(updated)
}

pub fn setup_widget(
    app: &tauri::App,
    paths: &PulsePaths,
    preferences: &PulsePreferences,
) -> tauri::Result<()> {
    let height = if preferences.widget_expanded {
        350.0
    } else {
        112.0
    };
    tauri::WebviewWindowBuilder::new(
        app,
        "widget",
        tauri::WebviewUrl::App("index.html#widget".into()),
    )
    .title("Codex Pulse · Widget")
    .data_directory(paths.profile.clone())
    .inner_size(340.0, height)
    .visible(preferences.widget_visible)
    .focused(false)
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .always_on_top(preferences.widget_always_on_top)
    .shadow(true)
    .build()?;
    if let Some(window) = app.get_webview_window("widget") {
        let requested = preferences.widget_x.zip(preferences.widget_y);
        let monitors = window.available_monitors()?;
        let size = window.outer_size()?;
        if let Some((x, y)) = requested.filter(|(x, y)| {
            monitors.iter().any(|monitor| {
                let area = monitor.work_area();
                let p = area.position;
                let s = area.size;
                *x >= p.x
                    && *y >= p.y
                    && *x + size.width as i32 <= p.x + s.width as i32
                    && *y + size.height as i32 <= p.y + s.height as i32
            })
        }) {
            window.set_position(tauri::PhysicalPosition::new(x, y))?;
        } else if let Some(monitor) = window.primary_monitor()? {
            let area = monitor.work_area();
            let p = area.position;
            let s = area.size;
            window.set_position(tauri::PhysicalPosition::new(
                p.x + s.width as i32 - size.width as i32 - 24,
                p.y + 80,
            ))?;
        }
    }
    Ok(())
}

fn apply_widget(app: &tauri::AppHandle, preferences: &PulsePreferences) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("widget") {
        window
            .set_always_on_top(preferences.widget_always_on_top)
            .map_err(|error| error.to_string())?;
        window
            .set_size(tauri::LogicalSize::new(
                340.0,
                if preferences.widget_expanded {
                    350.0
                } else {
                    112.0
                },
            ))
            .map_err(|error| error.to_string())?;
        keep_widget_visible(app).map_err(|error| error.to_string())?;
        if preferences.widget_visible {
            window.show()
        } else {
            window.hide()
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn clamp_widget_position(
    position: (i32, i32),
    size: (u32, u32),
    area: (i32, i32, u32, u32),
) -> (i32, i32) {
    let right = (i64::from(area.0) + i64::from(area.2) - i64::from(size.0)).max(i64::from(area.0));
    let bottom = (i64::from(area.1) + i64::from(area.3) - i64::from(size.1)).max(i64::from(area.1));
    (
        i64::from(position.0).clamp(i64::from(area.0), right) as i32,
        i64::from(position.1).clamp(i64::from(area.1), bottom) as i32,
    )
}

pub fn keep_widget_visible(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("widget") {
        if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
            let position = window.outer_position()?;
            let size = window.outer_size()?;
            let area = monitor.work_area();
            let (x, y) = clamp_widget_position(
                (position.x, position.y),
                (size.width, size.height),
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
            );
            if x != position.x || y != position.y {
                window.set_position(tauri::PhysicalPosition::new(x, y))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn widget_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if ["hide", "expand", "collapse", "quit"].contains(&action.as_str()) {
        save_widget_position(&app);
    }
    let patch = match action.as_str() {
        "show" => serde_json::json!({"widgetVisible":true}),
        "hide" => serde_json::json!({"widgetVisible":false}),
        "expand" => serde_json::json!({"widgetExpanded":true}),
        "collapse" => serde_json::json!({"widgetExpanded":false}),
        "pin" => serde_json::json!({"widgetAlwaysOnTop":true}),
        "unpin" => serde_json::json!({"widgetAlwaysOnTop":false}),
        "showMain" => {
            if let Some(window) = app.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.unminimize().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
        "quit" => {
            app.exit(0);
            return Ok(());
        }
        _ => return Err("Unknown widget action".into()),
    };
    set_pulse_preferences(app.clone(), app.state::<PreferenceStore>(), patch)?;
    Ok(())
}

pub fn save_widget_position(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("widget") {
        if let Ok(position) = window.outer_position() {
            let store = app.state::<PreferenceStore>();
            if let Ok(mut value) = store.value.lock() {
                value.widget_x = Some(position.x);
                value.widget_y = Some(position.y);
                if let Ok(bytes) = serde_json::to_vec_pretty(&*value) {
                    let _ = fs::write(&store.path, bytes);
                }
            };
        }
    }
}

#[tauri::command]
pub fn get_pulse_paths(state: tauri::State<'_, PulsePaths>) -> PulsePaths {
    state.inner().clone()
}

#[tauri::command]
pub fn open_pulse_data_dir(state: tauri::State<'_, PulsePaths>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let command = "explorer.exe";
    #[cfg(target_os = "macos")]
    let command = "open";
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let command = "xdg-open";
    std::process::Command::new(command)
        .arg(&state.data)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_data_follows_the_executable_and_explicit_paths_must_be_absolute() {
        let executable = std::env::temp_dir().join("portable/pulse.exe");
        assert_eq!(
            resolve_data_path(None, &executable, false).unwrap(),
            executable.parent().unwrap().join("data")
        );
        assert!(resolve_data_path(Some("relative/data".into()), &executable, false).is_err());
    }
    #[test]
    fn appearance_patch_preserves_independent_widget_and_motion_preferences() {
        let initial = PulsePreferences {
            motion_level: "off".into(),
            widget_expanded: true,
            ..Default::default()
        };
        let changed = merged_preferences(&initial, serde_json::json!({"skinId":"meter"})).unwrap();
        assert_eq!(changed.skin_id, "meter");
        assert_eq!(changed.motion_level, "off");
        assert!(changed.widget_expanded);
        assert!(merged_preferences(&changed, serde_json::json!({"skinId":"unknown"})).is_err());
        assert!(merged_preferences(
            &changed,
            serde_json::json!({"accessToken":"never store auth here"})
        )
        .is_err());
    }
    #[test]
    fn widget_expansion_stays_in_the_work_area_on_mixed_dpi_and_negative_origin_monitors() {
        assert_eq!(
            clamp_widget_position((-80, 1300), (510, 525), (-2560, 0, 2560, 1440)),
            (-510, 915)
        );
        assert_eq!(
            clamp_widget_position((1800, 980), (340, 350), (0, 0, 1920, 1032)),
            (1580, 682)
        );
        assert_eq!(
            clamp_widget_position((1, 1), (500, 700), (0, 0, 300, 400)),
            (0, 0)
        );
    }

    #[test]
    fn legacy_migration_is_filtered_read_only_and_never_overwrites_new_preferences() {
        let directory =
            std::env::temp_dir().join(format!("pulse-migration-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let old = serde_json::to_vec(&serde_json::json!({"skinId":"meter","theme":"light","motionLevel":"off","compactMode":true,
            "widgetVisible":true,"widgetExpanded":true,"widgetPosition":{"x":-400,"y":80},"language":"zh","refreshSeconds":600,
            "launchAtLogin":true,"codexExecutable":"private-existing-tool","accessToken":"never-import"})).unwrap();
        fs::write(directory.join("settings.json"), &old).unwrap();
        let migrated = PreferenceStore::load(&directory);
        let prefs = migrated.value.lock().unwrap().clone();
        assert_eq!(prefs.skin_id, "meter");
        assert_eq!(prefs.motion_level, "off");
        assert_eq!(prefs.widget_x, Some(-400));
        assert!(prefs.widget_expanded);
        assert_eq!(migrated.legacy.unwrap().refresh_minutes, Some(10));
        assert_eq!(fs::read(directory.join("settings.json")).unwrap(), old);
        let native = fs::read_to_string(directory.join("pulse-preferences.json")).unwrap();
        assert!(!native.contains("private-existing-tool"));
        assert!(!native.contains("never-import"));
        fs::write(directory.join("settings.json"), b"{\"skinId\":\"clear\"}").unwrap();
        assert_eq!(
            PreferenceStore::load(&directory)
                .value
                .lock()
                .unwrap()
                .skin_id,
            "meter"
        );
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn invalid_legacy_values_cannot_change_typed_defaults() {
        let (preferences, legacy) = migrate_legacy(
            &serde_json::json!({"skinId":"other","theme":42,"widgetVisible":"yes","refreshSeconds":-1,"language":"invalid"}),
        );
        assert_eq!(preferences, PulsePreferences::default());
        assert_eq!(legacy, LegacyPreferences::default());
    }
}
