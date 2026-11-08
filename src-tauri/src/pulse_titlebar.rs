//! A separate Pulse window attached to the verified Codex desktop title bar.
//! No host code, DOM, conversation, or installation file is modified.
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};

pub const BADGE_LABEL: &str = "pulse-badge";
pub const PANEL_LABEL: &str = "pulse-pace";
const BADGE_WIDTH: i32 = 112;
const BADGE_HEIGHT: i32 = 28;
const PANEL_WIDTH: i32 = 350;
const PANEL_HEIGHT: i32 = 430;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Rectangle {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
impl Rectangle {
    fn right(self) -> i32 {
        self.x.saturating_add(self.width)
    }
    fn bottom(self) -> i32 {
        self.y.saturating_add(self.height)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Placement {
    badge: Rectangle,
    panel: Rectangle,
}

/// All values here are physical pixels. Caption bounds are relative to the host window.
fn placement(
    frame: Rectangle,
    work: Rectangle,
    dpi: u32,
    caption: Option<Rectangle>,
) -> Option<Placement> {
    if frame.width <= 0 || frame.height <= 0 || work.width <= 0 || work.height <= 0 {
        return None;
    }
    let scale = |value: i32| ((i64::from(value) * i64::from(dpi.clamp(96, 768)) + 48) / 96) as i32;
    let width = scale(BADGE_WIDTH);
    let height = scale(BADGE_HEIGHT);
    let gap = scale(8);
    let caption = caption.filter(|rect| {
        rect.x > scale(100)
            && rect.width > 0
            && rect.height > 0
            && rect.right() <= frame.width + scale(4)
            && rect.bottom() <= scale(80)
    });
    let controls_left = caption
        .map(|rect| frame.x + rect.x)
        .unwrap_or(frame.right() - scale(46 * 3));
    let x = controls_left - gap - width;
    let y = caption
        .map(|rect| frame.y + rect.y + (rect.height - height).max(0) / 2)
        .unwrap_or(frame.y + scale(4))
        .max(work.y + scale(2));
    if x < frame.x + scale(100)
        || x < work.x
        || x + width > work.right()
        || y < frame.y
        || y + height > frame.bottom()
        || y + height > work.bottom()
    {
        return None;
    }
    let badge = Rectangle {
        x,
        y,
        width,
        height,
    };
    let panel_width = scale(PANEL_WIDTH).min(work.width - gap * 2).max(1);
    let panel_height = scale(PANEL_HEIGHT).min(work.height - gap * 2).max(1);
    let panel = Rectangle {
        x: (badge.right() - panel_width).clamp(
            work.x + gap,
            (work.right() - gap - panel_width).max(work.x + gap),
        ),
        y: (badge.bottom() + gap).clamp(
            work.y + gap,
            (work.bottom() - gap - panel_height).max(work.y + gap),
        ),
        width: panel_width,
        height: panel_height,
    };
    Some(Placement { badge, panel })
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlebarStatus {
    pub enabled: bool,
    pub supported: bool,
    pub host_found: bool,
    pub badge_visible: bool,
    pub badge_foreground: bool,
    pub popup_open: bool,
    pub popup_foreground: bool,
    pub reason: String,
    pub host_rect: Option<Rectangle>,
    pub badge_rect: Option<Rectangle>,
    pub panel_rect: Option<Rectangle>,
    pub dpi: Option<u32>,
}
impl TitlebarStatus {
    fn initial(enabled: bool) -> Self {
        Self {
            enabled,
            supported: cfg!(windows),
            host_found: false,
            badge_visible: false,
            badge_foreground: false,
            popup_open: false,
            popup_foreground: false,
            reason: if cfg!(windows) {
                "no_codex_window"
            } else {
                "unsupported"
            }
            .into(),
            host_rect: None,
            badge_rect: None,
            panel_rect: None,
            dpi: None,
        }
    }
}

#[derive(Clone)]
pub struct TitlebarController {
    enabled: Arc<AtomicBool>,
    popup: Arc<AtomicBool>,
    status: Arc<Mutex<TitlebarStatus>>,
    #[cfg(windows)]
    host: Arc<Mutex<Option<native::Host>>>,
}
impl TitlebarController {
    fn new(enabled: bool) -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(enabled)),
            popup: Arc::new(AtomicBool::new(false)),
            status: Arc::new(Mutex::new(TitlebarStatus::initial(enabled))),
            #[cfg(windows)]
            host: Arc::new(Mutex::new(None)),
        }
    }
}

fn update_status(app: &tauri::AppHandle, state: &TitlebarController, status: TitlebarStatus) {
    let changed = state
        .status
        .lock()
        .map(|mut current| {
            if *current == status {
                return false;
            }
            *current = status.clone();
            true
        })
        .unwrap_or(false);
    if changed {
        let _ = app.emit("titlebar-status", status);
    }
}

pub fn setup(
    app: &tauri::App,
    paths: &crate::pulse_desktop::PulsePaths,
    enabled: bool,
) -> tauri::Result<()> {
    let controller = TitlebarController::new(enabled);
    app.manage(controller.clone());
    #[cfg(windows)]
    {
        for (label, hash, title, width, height, shadow, focusable) in [
            (
                BADGE_LABEL,
                "pulse-badge",
                "Codex Pulse · Titlebar",
                BADGE_WIDTH,
                BADGE_HEIGHT,
                false,
                true,
            ),
            (
                PANEL_LABEL,
                "pulse-pace",
                "Codex Pulse · Pace",
                PANEL_WIDTH,
                PANEL_HEIGHT,
                true,
                true,
            ),
        ] {
            let window = tauri::WebviewWindowBuilder::new(
                app,
                label,
                tauri::WebviewUrl::App(format!("index.html#{hash}").into()),
            )
            .title(title)
            .data_directory(paths.profile.clone())
            .inner_size(width as f64, height as f64)
            .visible(false)
            .focused(false)
            .focusable(focusable)
            .decorations(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .transparent(true)
            .shadow(shadow)
            .build()?;
            if label == BADGE_LABEL {
                native::make_click_activatable(&window);
            }
            let app_handle = app.handle().clone();
            let state = controller.clone();
            let panel = label == PANEL_LABEL;
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    state.popup.store(false, Ordering::SeqCst);
                    native::restore_host_after_close(&app_handle, &state);
                    native::hide(&app_handle, PANEL_LABEL);
                }
                tauri::WindowEvent::Focused(false) if panel => {
                    // A natural badge click activates our process before its click IPC.
                    // Preserve the toggle's previous state until that click is handled.
                    if native::surface_is_foreground(&app_handle) {
                        log::info!("Pulse titlebar focus ignored: own_surface_still_foreground");
                    } else {
                        state.popup.store(false, Ordering::SeqCst);
                        native::hide(&app_handle, PANEL_LABEL);
                    }
                }
                _ => (),
            });
        }
        let app = app.handle().clone();
        std::thread::Builder::new()
            .name("pulse-titlebar".into())
            .spawn(move || loop {
                if app.get_webview_window("main").is_none() {
                    break;
                }
                native::tick(&app, &controller);
                std::thread::sleep(std::time::Duration::from_millis(250));
            })
            .map_err(|error| tauri::Error::Io(error))?;
    }
    #[cfg(not(windows))]
    let _ = paths;
    Ok(())
}

pub fn apply_enabled(app: &tauri::AppHandle, enabled: bool) {
    if let Some(state) = app.try_state::<TitlebarController>() {
        state.enabled.store(enabled, Ordering::SeqCst);
        if !enabled {
            state.popup.store(false, Ordering::SeqCst);
        }
        #[cfg(windows)]
        native::tick(app, state.inner());
        #[cfg(not(windows))]
        update_status(app, state.inner(), TitlebarStatus::initial(enabled));
    }
}

#[tauri::command]
pub fn get_titlebar_status(
    state: tauri::State<'_, TitlebarController>,
) -> Result<TitlebarStatus, String> {
    state
        .status
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "Titlebar status unavailable".into())
}

#[tauri::command]
pub fn titlebar_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    action: String,
) -> Result<(), String> {
    let state = app
        .try_state::<TitlebarController>()
        .ok_or("Titlebar is not initialized")?;
    match action.as_str() {
        "close" => {
            state.popup.store(false, Ordering::SeqCst);
            #[cfg(windows)]
            {
                native::restore_host_after_close(&app, state.inner());
                native::tick(&app, state.inner());
            }
            Ok(())
        }
        "toggle" => {
            #[cfg(windows)]
            {
                if window.label() != BADGE_LABEL {
                    log::warn!("Pulse titlebar focus rejected: sender_not_badge");
                    return Err("Open usage rhythm from its titlebar shortcut".into());
                }
                native::tick(&app, state.inner());
                if !state
                    .status
                    .lock()
                    .map(|status| status.badge_visible)
                    .unwrap_or(false)
                {
                    return Err("Open Codex and enable the titlebar shortcut first".into());
                }
                let open = !state.popup.fetch_xor(true, Ordering::SeqCst);
                if !open {
                    native::restore_host_after_close(&app, state.inner());
                }
                native::tick(&app, state.inner());
                if open {
                    if let Err(error) = native::activate_panel(&app, state.inner()) {
                        state.popup.store(false, Ordering::SeqCst);
                        native::tick(&app, state.inner());
                        return Err(error);
                    }
                    native::tick(&app, state.inner());
                }
                Ok(())
            }
            #[cfg(not(windows))]
            Err("The attached shortcut is available on Windows".into())
        }
        "showMain" | "details" => {
            state.popup.store(false, Ordering::SeqCst);
            #[cfg(windows)]
            native::tick(&app, state.inner());
            if let Some(window) = app.get_webview_window("main") {
                window.show().map_err(|error| error.to_string())?;
                window.unminimize().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())?;
            }
            if action == "details" {
                app.emit("pulse-show-pace-details", ())
                    .map_err(|error| error.to_string())?;
            }
            Ok(())
        }
        _ => Err("Unknown titlebar action".into()),
    }
}

#[cfg(windows)]
mod native {
    use super::*;
    use std::ffi::c_void;
    #[cfg(feature = "e2e")]
    use std::path::Path;
    type Hwnd = isize;
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    #[derive(Default)]
    struct MonitorInfo {
        size: u32,
        monitor: Rect,
        work: Rect,
        flags: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> Hwnd;
        fn SetForegroundWindow(window: Hwnd) -> i32;
        fn SetActiveWindow(window: Hwnd) -> Hwnd;
        fn SetFocus(window: Hwnd) -> Hwnd;
        fn GetAncestor(window: Hwnd, flags: u32) -> Hwnd;
        fn GetWindowRect(window: Hwnd, rect: *mut Rect) -> i32;
        fn GetClassNameW(window: Hwnd, text: *mut u16, capacity: i32) -> i32;
        fn GetWindowThreadProcessId(window: Hwnd, process: *mut u32) -> u32;
        fn IsWindowVisible(window: Hwnd) -> i32;
        fn IsIconic(window: Hwnd) -> i32;
        fn GetDpiForWindow(window: Hwnd) -> u32;
        fn MonitorFromWindow(window: Hwnd, flags: u32) -> isize;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
        fn SetWindowPos(
            window: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
        fn ShowWindow(window: Hwnd, command: i32) -> i32;
        fn GetWindowLongPtrW(window: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(window: Hwnd, index: i32, value: isize) -> isize;
        fn SetThreadDpiAwarenessContext(context: isize) -> isize;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, process: u32) -> isize;
        fn QueryFullProcessImageNameW(
            process: isize,
            flags: u32,
            path: *mut u16,
            length: *mut u32,
        ) -> i32;
        fn GetPackageFamilyName(process: isize, length: *mut u32, family: *mut u16) -> i32;
        fn CloseHandle(handle: isize) -> i32;
    }
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmGetWindowAttribute(
            window: Hwnd,
            attribute: u32,
            value: *mut c_void,
            size: u32,
        ) -> i32;
    }
    #[derive(Clone, Copy)]
    pub(super) struct Host {
        window: Hwnd,
        process: u32,
    }

    fn rectangle(rect: Rect) -> Rectangle {
        Rectangle {
            x: rect.left,
            y: rect.top,
            width: rect.right.saturating_sub(rect.left),
            height: rect.bottom.saturating_sub(rect.top),
        }
    }
    fn handle(app: &tauri::AppHandle, label: &str) -> Option<Hwnd> {
        app.get_webview_window(label)?
            .hwnd()
            .ok()
            .map(|handle| handle.0 as Hwnd)
    }
    pub(super) fn make_click_activatable(window: &tauri::WebviewWindow) {
        if let Ok(window) = window.hwnd() {
            unsafe {
                let handle = window.0 as Hwnd;
                let style = GetWindowLongPtrW(handle, -20);
                // Presentation still uses SWP_NOACTIVATE. Only a user's click may
                // activate the badge, giving this process the normal input privilege.
                SetWindowLongPtrW(handle, -20, (style & !0x08000000) | 0x80);
            }
        }
    }
    pub(super) fn surface_is_foreground(app: &tauri::AppHandle) -> bool {
        let foreground = unsafe { GetAncestor(GetForegroundWindow(), 2) };
        [BADGE_LABEL, PANEL_LABEL]
            .into_iter()
            .any(|label| handle(app, label) == Some(foreground))
    }
    pub(super) fn hide(app: &tauri::AppHandle, label: &str) {
        if let Some(window) = handle(app, label) {
            unsafe {
                if IsWindowVisible(window) != 0 {
                    ShowWindow(window, 0);
                }
            }
        }
    }
    fn show_at(app: &tauri::AppHandle, label: &str, rect: Rectangle) -> bool {
        if let Some(window) = handle(app, label) {
            unsafe {
                let mut current = Rect::default();
                let visible = IsWindowVisible(window) != 0;
                if visible && GetWindowRect(window, &mut current) != 0 && rectangle(current) == rect
                {
                    return true;
                }
                return SetWindowPos(
                    window,
                    -1,
                    rect.x,
                    rect.y,
                    rect.width,
                    rect.height,
                    0x0010 | 0x0040 | 0x0200,
                ) != 0
                    && IsWindowVisible(window) != 0;
            }
        }
        false
    }

    fn valid_packaged_executable(path: &str, family: &str) -> bool {
        if family != "OpenAI.Codex_2p2nqsd0c76g0" {
            return false;
        }
        let normalized = path.replace('\\', "/").to_ascii_lowercase();
        let Some((package, file)) = normalized.rsplit_once("/app/") else {
            return false;
        };
        if file != "chatgpt.exe" && file != "codex.exe" {
            return false;
        }
        let Some(name) = package.rsplit('/').next() else {
            return false;
        };
        name.starts_with("openai.codex_")
            && name.ends_with("__2p2nqsd0c76g0")
            && package
                .rsplit_once('/')
                .is_some_and(|(parent, _)| parent.ends_with("/windowsapps"))
    }
    fn main_window_style(style: isize) -> bool {
        // Electron utility windows share the executable and class. Require a resizable
        // top-level application frame with the same minimize/maximize controls as Codex.
        const FRAME_AND_CONTROLS: isize = 0x00c70000;
        style & FRAME_AND_CONTROLS == FRAME_AND_CONTROLS
    }
    fn process_identity(process: u32) -> Option<(String, String)> {
        unsafe {
            let handle = OpenProcess(0x1000, 0, process); // PROCESS_QUERY_LIMITED_INFORMATION only
            if handle == 0 {
                return None;
            }
            let result = (|| {
                let mut path = vec![0u16; 32768];
                let mut length = path.len() as u32;
                if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut length) == 0 {
                    return None;
                }
                path.truncate(length as usize);
                let path = String::from_utf16(&path).ok()?;
                let mut family_length = 0;
                let family = if GetPackageFamilyName(
                    handle,
                    &mut family_length,
                    std::ptr::null_mut(),
                ) == 122
                    && family_length <= 512
                {
                    let mut family = vec![0u16; family_length as usize];
                    if GetPackageFamilyName(handle, &mut family_length, family.as_mut_ptr()) == 0 {
                        while family.last() == Some(&0) {
                            family.pop();
                        }
                        String::from_utf16(&family).ok()?
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };
                Some((path, family))
            })();
            CloseHandle(handle);
            result
        }
    }

    #[cfg(feature = "e2e")]
    fn valid_fixture(process: u32, path: &str, class: &str) -> bool {
        let pid = std::env::var("PULSE_TITLEBAR_TEST_PID")
            .ok()
            .and_then(|value| value.parse::<u32>().ok());
        if pid != Some(process) || class != "PulseTitlebarTestHost" {
            return false;
        }
        let Some(root) = std::env::var_os("PULSE_TEST_FIXTURE_ROOT").map(std::path::PathBuf::from)
        else {
            return false;
        };
        let Ok(root) = root.canonicalize() else {
            return false;
        };
        let Ok(path) = Path::new(path).canonicalize() else {
            return false;
        };
        path.starts_with(root)
            && path.file_name().is_some_and(|name| {
                name.to_string_lossy()
                    .eq_ignore_ascii_case("pulse-titlebar-fixture.exe")
            })
    }
    fn trusted_window(window: Hwnd) -> Option<Host> {
        unsafe {
            if window == 0
                || IsWindowVisible(window) == 0
                || IsIconic(window) != 0
                || GetAncestor(window, 2) != window
                || !main_window_style(GetWindowLongPtrW(window, -16))
            {
                return None;
            }
            let mut process = 0;
            GetWindowThreadProcessId(window, &mut process);
            if process == 0 || process == std::process::id() {
                return None;
            }
            let mut class = [0u16; 128];
            let length = GetClassNameW(window, class.as_mut_ptr(), class.len() as i32);
            if length <= 0 {
                return None;
            }
            let class = String::from_utf16(&class[..length as usize]).ok()?;
            let (path, family) = process_identity(process)?;
            let accepted =
                class == "Chrome_WidgetWin_1" && valid_packaged_executable(&path, &family);
            #[cfg(feature = "e2e")]
            let accepted = accepted || valid_fixture(process, &path, &class);
            accepted.then_some(Host { window, process })
        }
    }
    fn host_still_valid(host: Host) -> bool {
        trusted_window(host.window).is_some_and(|current| current.process == host.process)
    }
    /// Called only by the badge's explicit click command. The watcher always uses
    /// SWP_NOACTIVATE; a visible window alone does not imply native input focus.
    pub(super) fn activate_panel(
        app: &tauri::AppHandle,
        state: &TitlebarController,
    ) -> Result<(), String> {
        fn rejected(category: &'static str) -> String {
            log::warn!("Pulse titlebar focus rejected: {category}");
            "The usage popup could not receive input focus".into()
        }
        let panel = handle(app, PANEL_LABEL).ok_or_else(|| rejected("panel_unavailable"))?;
        let foreground = unsafe { GetAncestor(GetForegroundWindow(), 2) };
        let badge = handle(app, BADGE_LABEL).ok_or_else(|| rejected("badge_unavailable"))?;
        let host = state
            .host
            .lock()
            .ok()
            .and_then(|value| *value)
            .filter(|host| host_still_valid(*host))
            .ok_or_else(|| rejected("host_identity_changed"))?;
        // Real Windows clicks activate the badge first. Synthetic driver events can
        // arrive while the verified host is still foreground; neither permits an
        // unrelated foreground application to have its focus redirected.
        if foreground != badge && foreground != host.window {
            return Err(rejected("host_or_badge_not_foreground"));
        }
        if !state.enabled.load(Ordering::SeqCst)
            || !state.popup.load(Ordering::SeqCst)
            || unsafe { IsWindowVisible(badge) } == 0
            || unsafe { IsWindowVisible(panel) } == 0
        {
            return Err(rejected("panel_not_ready"));
        }
        if unsafe { GetAncestor(GetForegroundWindow(), 2) } != foreground || !host_still_valid(host)
        {
            return Err(rejected("foreground_changed_before_activation"));
        }
        unsafe {
            SetForegroundWindow(panel);
            if GetAncestor(GetForegroundWindow(), 2) == panel {
                SetActiveWindow(panel);
                SetFocus(panel);
            }
        }
        if let Some(window) = app.get_webview_window(PANEL_LABEL) {
            window
                .set_focus()
                .map_err(|_| rejected("webview_focus_failed"))?;
        }
        if unsafe { GetAncestor(GetForegroundWindow(), 2) } != panel {
            return Err(rejected("foreground_activation_denied"));
        }
        log::info!(
            "Pulse titlebar popup activated; badge_was_foreground={}",
            foreground == badge
        );
        Ok(())
    }
    /// A user's explicit dismiss should leave Codex ready for typing. Outside
    /// focus changes and the watcher never call this or pull another app back.
    pub(super) fn restore_host_after_close(app: &tauri::AppHandle, state: &TitlebarController) {
        let foreground = unsafe { GetAncestor(GetForegroundWindow(), 2) };
        if ![BADGE_LABEL, PANEL_LABEL]
            .into_iter()
            .any(|label| handle(app, label) == Some(foreground))
        {
            return;
        }
        let host = state
            .host
            .lock()
            .ok()
            .and_then(|value| *value)
            .filter(|host| host_still_valid(*host));
        if let Some(host) = host {
            if unsafe { GetAncestor(GetForegroundWindow(), 2) } != foreground {
                return;
            }
            unsafe {
                SetForegroundWindow(host.window);
            }
            if unsafe { GetAncestor(GetForegroundWindow(), 2) } != host.window {
                log::warn!("Pulse titlebar focus rejected: host_restore_denied");
            }
        }
    }
    fn geometry(host: Host) -> Option<(Rectangle, Rectangle, u32, Option<Rectangle>)> {
        unsafe {
            if !host_still_valid(host) {
                return None;
            }
            let mut frame = Rect::default();
            if GetWindowRect(host.window, &mut frame) == 0 {
                return None;
            }
            let mut info = MonitorInfo {
                size: std::mem::size_of::<MonitorInfo>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(MonitorFromWindow(host.window, 2), &mut info) == 0 {
                return None;
            }
            let mut caption = Rect::default();
            let valid_caption = DwmGetWindowAttribute(
                host.window,
                5,
                &mut caption as *mut _ as *mut c_void,
                std::mem::size_of::<Rect>() as u32,
            ) == 0;
            Some((
                rectangle(frame),
                rectangle(info.work),
                GetDpiForWindow(host.window).max(96),
                valid_caption.then(|| rectangle(caption)),
            ))
        }
    }

    pub(super) fn tick(app: &tauri::AppHandle, state: &TitlebarController) {
        struct DpiGuard(isize);
        impl Drop for DpiGuard {
            fn drop(&mut self) {
                if self.0 != 0 {
                    unsafe {
                        SetThreadDpiAwarenessContext(self.0);
                    }
                }
            }
        }
        // Both DWM and window rectangles must use the same physical-pixel coordinate space.
        let _dpi = DpiGuard(unsafe { SetThreadDpiAwarenessContext(-4) });
        let enabled = state.enabled.load(Ordering::SeqCst);
        let foreground = unsafe { GetAncestor(GetForegroundWindow(), 2) };
        let own_panel = handle(app, PANEL_LABEL).is_some_and(|window| window == foreground);
        let own_badge = handle(app, BADGE_LABEL).is_some_and(|window| window == foreground);
        let current = trusted_window(foreground);
        if let Some(host) = current {
            if let Ok(mut saved) = state.host.lock() {
                *saved = Some(host);
            }
        }
        let last = state
            .host
            .lock()
            .ok()
            .and_then(|value| *value)
            .filter(|host| host_still_valid(*host));
        let active = current.or_else(|| {
            (own_badge || (own_panel && state.popup.load(Ordering::SeqCst)))
                .then_some(last)
                .flatten()
        });
        let host_found = last.is_some();
        let mut status = TitlebarStatus::initial(enabled);
        status.host_found = host_found;
        let reason = if !enabled {
            "disabled"
        } else if active.is_none() {
            if host_found {
                "host_inactive"
            } else {
                "no_codex_window"
            }
        } else {
            "window_too_small"
        };
        status.reason = reason.into();
        if enabled {
            if let Some((frame, work, dpi, caption)) = active.and_then(geometry) {
                status.host_rect = Some(frame);
                status.dpi = Some(dpi);
                if let Some(position) = placement(frame, work, dpi, caption) {
                    status.badge_visible = true;
                    status.badge_foreground = own_badge;
                    status.popup_open = state.popup.load(Ordering::SeqCst);
                    status.popup_foreground = status.popup_open && own_panel;
                    status.badge_rect = Some(position.badge);
                    status.panel_rect = Some(position.panel);
                    status.reason = "ready".into();
                    status.badge_visible = show_at(app, BADGE_LABEL, position.badge);
                    if status.popup_open && status.badge_visible {
                        status.popup_open = show_at(app, PANEL_LABEL, position.panel);
                    } else {
                        hide(app, PANEL_LABEL);
                    }
                    if !status.badge_visible {
                        status.reason = "window_unavailable".into();
                    }
                    update_status(app, state, status);
                    return;
                }
            }
        }
        state.popup.store(false, Ordering::SeqCst);
        hide(app, PANEL_LABEL);
        hide(app, BADGE_LABEL);
        update_status(app, state, status);
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn target_requires_package_identity_real_store_path_and_supported_executable() {
            let path="C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1103.4239.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe";
            assert!(valid_packaged_executable(
                path,
                "OpenAI.Codex_2p2nqsd0c76g0"
            ));
            assert!(!valid_packaged_executable(path, "Unrelated_2p2nqsd0c76g0"));
            assert!(!valid_packaged_executable(
                "C:\\MyApps\\ChatGPT.exe",
                "OpenAI.Codex_2p2nqsd0c76g0"
            ));
            assert!(!valid_packaged_executable(
                &path.replace("ChatGPT.exe", "helper.exe"),
                "OpenAI.Codex_2p2nqsd0c76g0"
            ));
            assert!(!valid_packaged_executable(
                &path.replace("WindowsApps", "Other"),
                "OpenAI.Codex_2p2nqsd0c76g0"
            ));
            assert!(main_window_style(0x14c70000));
            assert!(main_window_style(0x00cf0000));
            assert!(!main_window_style(0x80000000));
            assert!(!main_window_style(0x00c00000));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn badge_avoids_native_controls_and_panel_fits_work_area() {
        let frame = Rectangle {
            x: 100,
            y: 60,
            width: 1440,
            height: 960,
        };
        let work = Rectangle {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let caption = Rectangle {
            x: 1302,
            y: 0,
            width: 138,
            height: 32,
        };
        let result = placement(frame, work, 96, Some(caption)).unwrap();
        assert!(result.badge.right() < frame.x + caption.x);
        assert_eq!(result.badge.height, 28);
        assert!(result.panel.right() <= work.right());
        assert!(result.panel.bottom() <= work.bottom());
        assert!(result.panel.y >= result.badge.bottom());
    }
    #[test]
    fn mixed_dpi_negative_origin_and_maximized_border_keep_the_badge_visible() {
        let frame = Rectangle {
            x: -2568,
            y: -8,
            width: 2576,
            height: 1456,
        };
        let work = Rectangle {
            x: -2560,
            y: 0,
            width: 2560,
            height: 1400,
        };
        let result = placement(
            frame,
            work,
            144,
            Some(Rectangle {
                x: 2361,
                y: 8,
                width: 207,
                height: 48,
            }),
        )
        .unwrap();
        assert_eq!(result.badge.width, 168);
        assert_eq!(result.badge.height, 42);
        assert!(result.badge.y >= 0);
        assert!(result.badge.right() <= 0);
        assert!(result.panel.x >= -2560);
        assert!(result.panel.right() <= 0);
        assert!(result.panel.bottom() <= 1400);
    }
    #[test]
    fn narrow_or_offscreen_titlebars_do_not_cover_controls_or_other_apps() {
        let work = Rectangle {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };
        assert!(placement(
            Rectangle {
                x: 0,
                y: 0,
                width: 220,
                height: 600
            },
            work,
            96,
            None
        )
        .is_none());
        assert!(placement(
            Rectangle {
                x: 2500,
                y: 0,
                width: 1200,
                height: 800
            },
            work,
            96,
            None
        )
        .is_none());
        assert!(placement(
            Rectangle {
                x: 0,
                y: 0,
                width: 0,
                height: 0
            },
            work,
            96,
            None
        )
        .is_none());
    }
    #[test]
    fn invalid_dwm_caption_bounds_use_safe_fallback_and_small_work_area_shrinks_panel() {
        let frame = Rectangle {
            x: 0,
            y: 0,
            width: 700,
            height: 500,
        };
        let work = Rectangle {
            x: 0,
            y: 0,
            width: 700,
            height: 400,
        };
        let result = placement(
            frame,
            work,
            96,
            Some(Rectangle {
                x: 0,
                y: -999,
                width: 0,
                height: 0,
            }),
        )
        .unwrap();
        assert!(result.badge.right() <= 700 - 138);
        assert!(result.panel.bottom() <= 400);
        assert_eq!(result.panel.height, 384);
    }
}
