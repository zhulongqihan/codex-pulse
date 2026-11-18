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
    mut data: serde_json::Value,
) -> Result<(), String> {
    crate::quota_scope::with_live(|revision| {
        if revision > 0 && data["quotaIdentityRevision"].as_u64() != Some(revision) {
            clear_account_snapshot(&mut data, revision);
        }
        *state.0.lock().map_err(|_| "Widget state unavailable")? = Some(data.clone());
        if let Some(paths) = app.try_state::<PulsePaths>() {
            crate::pulse_mcp::publish_widget_snapshot(&data, &paths.data);
        }
        app.emit_to("widget", "widget-snapshot-updated", data)
            .map_err(|error| error.to_string())
    })
}

fn clear_account_snapshot(data: &mut serde_json::Value, revision: u64) {
    if !data.is_object() {
        *data = serde_json::json!({});
    }
    for key in ["account", "membership", "workspace"] {
        data[key] = serde_json::Value::Null;
    }
    data["quotas"] = serde_json::json!([]);
    data["quotaIdentityRevision"] = serde_json::json!(revision);
    data["stale"] = serde_json::json!(true);
    if data["integration"].is_object() {
        data["integration"]["quotas"] = serde_json::json!([]);
        data["integration"]["quotaUpdatedAt"] = serde_json::Value::Null;
        data["integration"]["quotaStale"] = serde_json::json!(true);
    }
}

pub(crate) fn invalidate_account_snapshot(app: &tauri::AppHandle, revision: u64) {
    if let Some(widget) = app.try_state::<WidgetSnapshot>() {
        if let Ok(mut stored) = widget.0.lock() {
            if let Some(data) = stored.as_mut() {
                clear_account_snapshot(data, revision);
                if let Some(paths) = app.try_state::<PulsePaths>() {
                    crate::pulse_mcp::publish_widget_snapshot(data, &paths.data);
                }
                let _ = app.emit_to("widget", "widget-snapshot-updated", data.clone());
            }
        }
    }
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
    pub widget_skin: String,
    pub theme: String,
    pub motion_level: String,
    pub compact_mode: bool,
    pub respect_reduced_motion: bool,
    pub widget_visible: bool,
    pub widget_expanded: bool,
    pub widget_always_on_top: bool,
    pub titlebar_enabled: bool,
    pub widget_x: Option<i32>,
    pub widget_y: Option<i32>,
}

impl Default for PulsePreferences {
    fn default() -> Self {
        Self {
            skin_id: "clear".into(),
            widget_skin: "follow".into(),
            theme: "system".into(),
            motion_level: "gentle".into(),
            compact_mode: false,
            respect_reduced_motion: true,
            widget_visible: false,
            widget_expanded: false,
            widget_always_on_top: true,
            titlebar_enabled: true,
            widget_x: None,
            widget_y: None,
        }
    }
}

pub struct PreferenceStore {
    pub value: Mutex<PulsePreferences>,
    path: PathBuf,
    titlebar_path: PathBuf,
    widget_appearance_path: PathBuf,
    legacy: Option<LegacyPreferences>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TitlebarPreferences {
    enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WidgetAppearancePreferences {
    skin_id: String,
}

/// Keep the established file readable by 0.5, whose parser rejects unknown fields.
/// The IPC DTO still includes the complete current preference set.
fn base_preferences(value: &PulsePreferences) -> Result<serde_json::Value, String> {
    let mut stored = serde_json::to_value(value).map_err(|error| error.to_string())?;
    let object = stored.as_object_mut().ok_or("Invalid preference object")?;
    object.remove("titlebarEnabled");
    object.remove("widgetSkin");
    Ok(stored)
}

fn write_preferences_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    Ok(())
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
        (
            "skinId",
            &["clear", "meter", "paper"][..],
            &mut preferences.skin_id,
        ),
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
        let titlebar_path = data.join("pulse-titlebar-preferences.json");
        let widget_appearance_path = data.join("pulse-widget-appearance.json");
        let legacy_path = data.join("pulse-legacy-preferences.json");
        if !path.exists() {
            if let Some(legacy) = fs::read(data.join("settings.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            {
                let (migrated, legacy_preferences) = migrate_legacy(&legacy);
                // Never rewrite the Electron file. Unknown fields and executable paths stay there.
                if let (Ok(preferences), Ok(imported)) = (
                    base_preferences(&migrated).and_then(|value| {
                        serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())
                    }),
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
        let mut value = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PulsePreferences>(&bytes).ok())
            .filter(|value| validate_preferences(value).is_ok())
            .unwrap_or_default();
        if let Some(titlebar) = fs::read(&titlebar_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<TitlebarPreferences>(&bytes).ok())
        {
            value.titlebar_enabled = titlebar.enabled;
        }
        if let Some(widget) = fs::read(&widget_appearance_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<WidgetAppearancePreferences>(&bytes).ok())
            .filter(|widget| {
                ["follow", "clear", "meter", "paper"].contains(&widget.skin_id.as_str())
            })
        {
            value.widget_skin = widget.skin_id;
        }
        Self {
            value: Mutex::new(value),
            path,
            titlebar_path,
            widget_appearance_path,
            legacy: fs::read(legacy_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok()),
        }
    }

    fn persist(
        &self,
        previous_value: &PulsePreferences,
        value: &PulsePreferences,
    ) -> Result<(), String> {
        let base = base_preferences(value)?;
        let previous = fs::read(&self.path).ok();
        // A widget-only change must not normalize, create, or repair the shared
        // preference file. Disk bytes are used only for rollback, not as user intent.
        let base_changed = base_preferences(previous_value)? != base;
        let mut writes: Vec<(&Path, Option<Vec<u8>>, Vec<u8>)> = Vec::new();
        if base_changed {
            writes.push((
                &self.path,
                previous,
                serde_json::to_vec_pretty(&base).map_err(|error| error.to_string())?,
            ));
        }
        let previous_titlebar = fs::read(&self.titlebar_path).ok();
        let existing_titlebar = fs::read(&self.titlebar_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<TitlebarPreferences>(&bytes).ok());
        if existing_titlebar
            .map(|preferences| preferences.enabled)
            .unwrap_or(true)
            != value.titlebar_enabled
        {
            let titlebar = serde_json::to_vec_pretty(&TitlebarPreferences {
                enabled: value.titlebar_enabled,
            })
            .map_err(|error| error.to_string())?;
            writes.push((&self.titlebar_path, previous_titlebar, titlebar));
        }
        let previous_widget = fs::read(&self.widget_appearance_path).ok();
        let existing_widget = previous_widget
            .as_deref()
            .and_then(|bytes| serde_json::from_slice::<WidgetAppearancePreferences>(bytes).ok())
            .filter(|widget| {
                ["follow", "clear", "meter", "paper"].contains(&widget.skin_id.as_str())
            })
            .map(|widget| widget.skin_id)
            .unwrap_or_else(|| "follow".into());
        if existing_widget != value.widget_skin {
            let widget = serde_json::to_vec_pretty(&WidgetAppearancePreferences {
                skin_id: value.widget_skin.clone(),
            })
            .map_err(|error| error.to_string())?;
            writes.push((&self.widget_appearance_path, previous_widget, widget));
        }
        for (index, (path, _, bytes)) in writes.iter().enumerate() {
            if let Err(error) = write_preferences_file(path, bytes) {
                // A combined appearance change either persists every file or restores
                // each already-written file, including its original formatting.
                let mut rollback_errors = Vec::new();
                for (written_path, previous_bytes, _) in writes[..index].iter().rev() {
                    let rollback = match previous_bytes {
                        Some(previous_bytes) => {
                            write_preferences_file(written_path, previous_bytes)
                        }
                        None => fs::remove_file(written_path).map_err(|cause| cause.to_string()),
                    };
                    if let Err(cause) = rollback {
                        rollback_errors.push(cause);
                    }
                }
                return if rollback_errors.is_empty() {
                    Err(error)
                } else {
                    Err(format!(
                        "{error}; preference rollback failed: {}",
                        rollback_errors.join("; ")
                    ))
                };
            }
        }
        Ok(())
    }
}

#[tauri::command]
pub fn get_legacy_preferences(
    state: tauri::State<'_, PreferenceStore>,
) -> Option<LegacyPreferences> {
    state.legacy.clone()
}

fn validate_preferences(value: &PulsePreferences) -> Result<(), String> {
    if !["clear", "meter", "paper"].contains(&value.skin_id.as_str()) {
        return Err("Unsupported skin".into());
    }
    if !["follow", "clear", "meter", "paper"].contains(&value.widget_skin.as_str()) {
        return Err("Unsupported widget skin".into());
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
    state.persist(&saved, &updated)?;
    *saved = updated.clone();
    drop(saved);
    apply_widget(&app, &updated)?;
    crate::pulse_titlebar::apply_enabled(&app, updated.titlebar_enabled);
    app.emit("pulse-preferences-changed", &updated)
        .map_err(|error| error.to_string())?;
    Ok(updated)
}

pub fn setup_widget(
    app: &tauri::App,
    paths: &PulsePaths,
    preferences: &PulsePreferences,
) -> tauri::Result<()> {
    let height = widget_default_height(preferences);
    tauri::WebviewWindowBuilder::new(
        app,
        "widget",
        tauri::WebviewUrl::App("index.html#widget".into()),
    )
    .title("Codex Pulse · Widget")
    .data_directory(paths.profile.clone())
    .inner_size(350.0, height)
    .visible(preferences.widget_visible)
    .focused(false)
    .decorations(false)
    .transparent(true)
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
                350.0,
                widget_default_height(preferences),
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

fn widget_default_height(preferences: &PulsePreferences) -> f64 {
    if preferences.widget_expanded {
        return 480.0;
    }
    let skin = if preferences.widget_skin == "follow" {
        &preferences.skin_id
    } else {
        &preferences.widget_skin
    };
    if skin == "paper" {
        84.0
    } else {
        180.0
    }
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

/// The two companion command entry points share the same navigation contract.
/// Generic showMain preserves the current view; explicit targets navigate only
/// after showing and focusing the main window succeeds.
pub(crate) fn show_main_action(
    action: &str,
    show: impl FnOnce() -> Result<(), String>,
    emit: impl FnOnce(&str) -> Result<(), String>,
) -> Result<(), String> {
    let event = match action {
        "showMain" => None,
        "account" => Some("pulse-show-account"),
        "details" => Some("pulse-show-pace-details"),
        _ => return Err("Unknown main window action".into()),
    };
    if action == "details" {
        crate::pulse_instance::mark_pace_details_pending();
    }
    show()?;
    if let Some(event) = event {
        emit(event)?;
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
        "showMain" | "account" | "details" => {
            return show_main_action(
                &action,
                || {
                    if let Some(window) = app.get_webview_window("main") {
                        window.show().map_err(|e| e.to_string())?;
                        window.unminimize().map_err(|e| e.to_string())?;
                        window.set_focus().map_err(|e| e.to_string())?;
                    }
                    Ok(())
                },
                |event| app.emit(event, ()).map_err(|e| e.to_string()),
            );
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
                let updated = PulsePreferences {
                    widget_x: Some(position.x),
                    widget_y: Some(position.y),
                    ..value.clone()
                };
                if store.persist(&value, &updated).is_ok() {
                    *value = updated;
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
    fn companion_account_action_focuses_before_navigation_and_preserves_generic_show_main() {
        use std::cell::RefCell;
        for (action, expected) in [
            ("account", Some("pulse-show-account")),
            ("details", Some("pulse-show-pace-details")),
            ("showMain", None),
        ] {
            let calls = RefCell::new(Vec::new());
            show_main_action(
                action,
                || {
                    calls.borrow_mut().push("show-unminimize-focus".to_string());
                    Ok(())
                },
                |event| {
                    calls.borrow_mut().push(event.into());
                    Ok(())
                },
            )
            .unwrap();
            let mut expected_calls = vec!["show-unminimize-focus".to_string()];
            if let Some(event) = expected {
                expected_calls.push(event.into());
            }
            assert_eq!(*calls.borrow(), expected_calls);
        }
        assert_eq!(
            show_main_action(
                "account",
                || Err("focus failed".into()),
                |_| panic!("No navigation after focus failure")
            ),
            Err("focus failed".into())
        );
        assert!(show_main_action(
            "unsupported",
            || panic!("Unknown action cannot show a window"),
            |_| Ok(())
        )
        .is_err());
    }

    // The v0.5.0 on-disk schema: unknown fields reject the entire document.
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Preferences050 {
        skin_id: String,
        theme: String,
        motion_level: String,
        compact_mode: bool,
        respect_reduced_motion: bool,
        widget_visible: bool,
        widget_expanded: bool,
        widget_always_on_top: bool,
        widget_x: Option<i32>,
        widget_y: Option<i32>,
    }

    fn preference_fixture() -> (PathBuf, Vec<u8>) {
        let directory =
            std::env::temp_dir().join(format!("pulse-preference-compat-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let original = serde_json::to_vec(
            &base_preferences(&PulsePreferences {
                skin_id: "meter".into(),
                theme: "dark".into(),
                motion_level: "off".into(),
                compact_mode: true,
                widget_visible: true,
                widget_expanded: true,
                widget_x: Some(-400),
                widget_y: Some(80),
                ..Default::default()
            })
            .unwrap(),
        )
        .unwrap();
        fs::write(directory.join("pulse-preferences.json"), &original).unwrap();
        (directory, original)
    }

    #[test]
    fn titlebar_preferences_survive_downgrade_without_polluting_the_050_file() {
        let (directory, original) = preference_fixture();
        let store = PreferenceStore::load(&directory);
        let initial = store.value.lock().unwrap().clone();
        let mut current = initial.clone();
        // Reproduce the regression before checking the new storage boundary.
        let mut inline_value = serde_json::to_value(&current).unwrap();
        inline_value.as_object_mut().unwrap().remove("widgetSkin");
        let inline = serde_json::to_vec(&inline_value).unwrap();
        assert!(serde_json::from_slice::<Preferences050>(&inline)
            .unwrap_err()
            .to_string()
            .contains("titlebarEnabled"));
        current.titlebar_enabled = false;
        store.persist(&initial, &current).unwrap();
        assert_eq!(
            fs::read(&store.path).unwrap(),
            original,
            "Titlebar-only updates preserve even the old file formatting"
        );
        let mut old: Preferences050 =
            serde_json::from_slice(&fs::read(&store.path).unwrap()).unwrap();
        assert_eq!(old.skin_id, "meter");
        assert_eq!(old.theme, "dark");
        assert!(old.widget_expanded);
        assert!(
            !PreferenceStore::load(&directory)
                .value
                .lock()
                .unwrap()
                .titlebar_enabled
        );
        // Simulate a genuine old-version save between downgrade and upgrade.
        old.theme = "light".into();
        old.widget_x = Some(-500);
        fs::write(&store.path, serde_json::to_vec_pretty(&old).unwrap()).unwrap();
        let upgraded = PreferenceStore::load(&directory);
        let mut value = upgraded.value.lock().unwrap().clone();
        assert_eq!(value.theme, "light");
        assert_eq!(value.widget_x, Some(-500));
        assert!(!value.titlebar_enabled);
        let previous = value.clone();
        value.widget_y = Some(100);
        upgraded.persist(&previous, &value).unwrap();
        assert_eq!(
            serde_json::from_slice::<Preferences050>(&fs::read(&store.path).unwrap())
                .unwrap()
                .widget_y,
            Some(100)
        );
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn invalid_titlebar_file_cannot_reset_the_established_preferences() {
        let (directory, _) = preference_fixture();
        fs::write(
            directory.join("pulse-titlebar-preferences.json"),
            b"{\"enabled\":\"invalid\"}",
        )
        .unwrap();
        let store = PreferenceStore::load(&directory);
        let value = store.value.lock().unwrap();
        assert_eq!(value.skin_id, "meter");
        assert_eq!(value.theme, "dark");
        assert!(value.titlebar_enabled);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn a_failed_extension_save_restores_the_previous_base_file() {
        let (directory, original) = preference_fixture();
        fs::create_dir(directory.join("pulse-titlebar-preferences.json")).unwrap();
        let store = PreferenceStore::load(&directory);
        let mut value = store.value.lock().unwrap().clone();
        let previous = value.clone();
        value.skin_id = "clear".into();
        value.titlebar_enabled = false;
        assert!(store.persist(&previous, &value).is_err());
        assert_eq!(fs::read(&store.path).unwrap(), original);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn an_unreleased_inline_titlebar_field_is_split_on_the_next_base_save() {
        let (directory, _) = preference_fixture();
        let mut value = PreferenceStore::load(&directory)
            .value
            .lock()
            .unwrap()
            .clone();
        value.titlebar_enabled = false;
        fs::write(
            directory.join("pulse-preferences.json"),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap();
        let store = PreferenceStore::load(&directory);
        let loaded = store.value.lock().unwrap().clone();
        assert!(!loaded.titlebar_enabled);
        let mut changed = loaded.clone();
        changed.widget_y = Some(100);
        store.persist(&loaded, &changed).unwrap();
        assert!(serde_json::from_slice::<Preferences050>(&fs::read(&store.path).unwrap()).is_ok());
        assert!(
            !PreferenceStore::load(&directory)
                .value
                .lock()
                .unwrap()
                .titlebar_enabled
        );
        fs::remove_dir_all(&directory).unwrap();
    }
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
    fn paper_patch_preserves_the_existing_independent_preferences() {
        let initial = PulsePreferences {
            skin_id: "meter".into(),
            theme: "dark".into(),
            motion_level: "off".into(),
            compact_mode: true,
            widget_expanded: true,
            widget_x: Some(-400),
            ..Default::default()
        };
        let changed = merged_preferences(&initial, serde_json::json!({"skinId":"paper"})).unwrap();
        assert_eq!(changed.skin_id, "paper");
        assert_eq!(changed.theme, "dark");
        assert_eq!(changed.motion_level, "off");
        assert!(changed.compact_mode && changed.widget_expanded);
        assert_eq!(changed.widget_x, Some(-400));
    }

    #[test]
    fn widget_skin_is_persisted_separately_without_rewriting_old_preferences() {
        let (directory, original) = preference_fixture();
        let titlebar_bytes = b"{ \"enabled\": false }\n";
        let legacy_bytes =
            b"{ \"language\": \"zh\", \"refreshMinutes\": 5, \"launchAtLogin\": true }\n";
        fs::write(
            directory.join("pulse-titlebar-preferences.json"),
            titlebar_bytes,
        )
        .unwrap();
        fs::write(
            directory.join("pulse-legacy-preferences.json"),
            legacy_bytes,
        )
        .unwrap();
        let store = PreferenceStore::load(&directory);
        let initial = store.value.lock().unwrap().clone();
        let changed =
            merged_preferences(&initial, serde_json::json!({"widgetSkin":"paper"})).unwrap();
        store.persist(&initial, &changed).unwrap();
        assert_eq!(fs::read(&store.path).unwrap(), original);
        assert_eq!(fs::read(&store.titlebar_path).unwrap(), titlebar_bytes);
        assert_eq!(
            fs::read(directory.join("pulse-legacy-preferences.json")).unwrap(),
            legacy_bytes
        );
        let old: Preferences050 = serde_json::from_slice(&fs::read(&store.path).unwrap()).unwrap();
        assert_eq!(old.skin_id, "meter");
        let reloaded = PreferenceStore::load(&directory);
        let value = reloaded.value.lock().unwrap().clone();
        assert_eq!(serde_json::to_value(&value).unwrap()["widgetSkin"], "paper");
        assert_eq!(value.skin_id, "meter");
        let changed = merged_preferences(&value, serde_json::json!({"skinId":"clear"})).unwrap();
        reloaded.persist(&value, &changed).unwrap();
        let value = PreferenceStore::load(&directory)
            .value
            .lock()
            .unwrap()
            .clone();
        assert_eq!(value.skin_id, "clear");
        assert_eq!(serde_json::to_value(value).unwrap()["widgetSkin"], "paper");
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn widget_only_save_does_not_create_a_missing_global_preferences_file() {
        let directory =
            std::env::temp_dir().join(format!("pulse-widget-no-base-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let store = PreferenceStore::load(&directory);
        let before = store.value.lock().unwrap().clone();
        let after = merged_preferences(&before, serde_json::json!({"widgetSkin":"paper"})).unwrap();
        store.persist(&before, &after).unwrap();
        assert!(!directory.join("pulse-preferences.json").exists());
        assert!(!directory.join("pulse-titlebar-preferences.json").exists());
        let reloaded = PreferenceStore::load(&directory);
        let value = reloaded.value.lock().unwrap().clone();
        assert_eq!(value.skin_id, "clear");
        assert_eq!(value.widget_skin, "paper");
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn widget_only_save_preserves_partial_old_global_preferences_bytes() {
        let directory = std::env::temp_dir().join(format!(
            "pulse-widget-partial-base-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&directory).unwrap();
        let original = b" {\n  \"skinId\": \"meter\", \"theme\": \"dark\"\n}\n";
        fs::write(directory.join("pulse-preferences.json"), original).unwrap();
        let store = PreferenceStore::load(&directory);
        let before = store.value.lock().unwrap().clone();
        let after = merged_preferences(&before, serde_json::json!({"widgetSkin":"paper"})).unwrap();
        store.persist(&before, &after).unwrap();
        assert_eq!(
            fs::read(directory.join("pulse-preferences.json")).unwrap(),
            original
        );
        let value = PreferenceStore::load(&directory)
            .value
            .lock()
            .unwrap()
            .clone();
        assert_eq!(value.skin_id, "meter");
        assert_eq!(value.theme, "dark");
        assert_eq!(value.widget_skin, "paper");
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn widget_only_save_preserves_global_preferences_with_unknown_extensions() {
        let directory = std::env::temp_dir().join(format!(
            "pulse-widget-extended-base-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&directory).unwrap();
        let original =
            b"{ \"skinId\":\"meter\", \"futureExtension\":{\"keep\":\"original bytes\"} }\n";
        fs::write(directory.join("pulse-preferences.json"), original).unwrap();
        let store = PreferenceStore::load(&directory);
        let before = store.value.lock().unwrap().clone();
        let after = merged_preferences(&before, serde_json::json!({"widgetSkin":"paper"})).unwrap();
        store.persist(&before, &after).unwrap();
        assert_eq!(
            fs::read(directory.join("pulse-preferences.json")).unwrap(),
            original
        );
        let value = PreferenceStore::load(&directory)
            .value
            .lock()
            .unwrap()
            .clone();
        assert_eq!(value.skin_id, before.skin_id);
        assert_eq!(value.widget_skin, "paper");
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn legacy_and_invalid_widget_styles_follow_without_resetting_global_preferences() {
        let (directory, _) = preference_fixture();
        for bytes in [
            None,
            Some(b"{\"skinId\":\"unknown\"}".as_slice()),
            Some(b"{\"skinId\":false}".as_slice()),
        ] {
            if let Some(bytes) = bytes {
                fs::write(directory.join("pulse-widget-appearance.json"), bytes).unwrap();
            }
            let value = PreferenceStore::load(&directory)
                .value
                .lock()
                .unwrap()
                .clone();
            assert_eq!(value.skin_id, "meter");
            assert_eq!(value.theme, "dark");
            assert_eq!(serde_json::to_value(value).unwrap()["widgetSkin"], "follow");
        }
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn failed_widget_save_restores_base_and_titlebar_bytes() {
        let (directory, original) = preference_fixture();
        let titlebar_bytes = b"{\"enabled\":false}\n";
        fs::write(
            directory.join("pulse-titlebar-preferences.json"),
            titlebar_bytes,
        )
        .unwrap();
        fs::create_dir(directory.join("pulse-widget-appearance.json")).unwrap();
        let store = PreferenceStore::load(&directory);
        let initial = store.value.lock().unwrap().clone();
        let changed = merged_preferences(
            &initial,
            serde_json::json!({"skinId":"clear","titlebarEnabled":true,"widgetSkin":"paper"}),
        )
        .unwrap();
        assert!(store.persist(&initial, &changed).is_err());
        assert_eq!(fs::read(&store.path).unwrap(), original);
        assert_eq!(fs::read(&store.titlebar_path).unwrap(), titlebar_bytes);
        let value = PreferenceStore::load(&directory)
            .value
            .lock()
            .unwrap()
            .clone();
        assert_eq!(value.skin_id, "meter");
        assert!(!value.titlebar_enabled);
        fs::remove_dir_all(&directory).unwrap();
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
