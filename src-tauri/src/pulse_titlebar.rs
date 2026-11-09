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
    #[cfg(windows)]
    surfaces: Arc<Mutex<native::Surfaces>>,
}
impl TitlebarController {
    fn new(enabled: bool) -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(enabled)),
            popup: Arc::new(AtomicBool::new(false)),
            status: Arc::new(Mutex::new(TitlebarStatus::initial(enabled))),
            #[cfg(windows)]
            host: Arc::new(Mutex::new(None)),
            #[cfg(windows)]
            surfaces: Arc::new(Mutex::new(native::Surfaces::default())),
        }
    }
}

fn update_status(app: &tauri::AppHandle, state: &TitlebarController, status: TitlebarStatus) {
    let changed = state
        .status
        .lock()
        .map(|mut current| {
            // Native geometry is available to diagnostics immediately. Moving a host
            // must not broadcast an IPC update to every WebView on every frame.
            let changed = current.enabled != status.enabled
                || current.supported != status.supported
                || current.host_found != status.host_found
                || current.badge_visible != status.badge_visible
                || current.badge_foreground != status.badge_foreground
                || current.popup_open != status.popup_open
                || current.popup_foreground != status.popup_foreground
                || current.reason != status.reason
                || current.dpi != status.dpi;
            *current = status.clone();
            changed
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
            native::cache_surface(&controller, label, &window)?;
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
        if let Some(main) = app.get_webview_window("main") {
            native::cache_surface(&controller, "main", &main)?;
        }
        native::start_watcher(app.handle().clone(), controller)?;
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
    use std::cell::Cell;
    use std::ffi::c_void;
    #[cfg(feature = "e2e")]
    use std::path::Path;
    use std::time::{Duration, Instant};
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
    #[repr(C)]
    #[derive(Default)]
    struct Message {
        window: Hwnd,
        message: u32,
        w: usize,
        l: isize,
        time: u32,
        point: [i32; 2],
        private: u32,
    }
    type WinEventCallback = unsafe extern "system" fn(isize, u32, Hwnd, i32, i32, u32, u32);
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
        fn IsWindow(window: Hwnd) -> i32;
        fn SetWinEventHook(
            first: u32,
            last: u32,
            module: isize,
            callback: WinEventCallback,
            process: u32,
            thread: u32,
            flags: u32,
        ) -> isize;
        fn UnhookWinEvent(hook: isize) -> i32;
        fn PeekMessageW(
            message: *mut Message,
            window: Hwnd,
            first: u32,
            last: u32,
            remove: u32,
        ) -> i32;
        fn TranslateMessage(message: *const Message) -> i32;
        fn DispatchMessageW(message: *const Message) -> isize;
        fn MsgWaitForMultipleObjectsEx(
            count: u32,
            handles: *const isize,
            timeout: u32,
            wake_mask: u32,
            flags: u32,
        ) -> u32;
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
        fn WaitForSingleObject(handle: isize, timeout: u32) -> u32;
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
    struct VerifiedProcess(isize);
    impl Drop for VerifiedProcess {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    #[derive(Clone)]
    pub(super) struct Host {
        window: Hwnd,
        process: u32,
        thread: u32,
        class: String,
        identity: Arc<VerifiedProcess>,
    }
    #[derive(Clone, Copy, Default)]
    pub(super) struct Surfaces {
        badge: Hwnd,
        panel: Hwnd,
        main: Hwnd,
    }
    pub(super) fn cache_surface(
        state: &TitlebarController,
        label: &str,
        window: &tauri::WebviewWindow,
    ) -> tauri::Result<()> {
        let handle = window.hwnd()?.0 as Hwnd;
        if let Ok(mut surfaces) = state.surfaces.lock() {
            match label {
                BADGE_LABEL => surfaces.badge = handle,
                PANEL_LABEL => surfaces.panel = handle,
                "main" => surfaces.main = handle,
                _ => (),
            }
        }
        Ok(())
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
        let state = app.try_state::<TitlebarController>()?;
        let surfaces = *state.surfaces.lock().ok()?;
        let window = match label {
            BADGE_LABEL => surfaces.badge,
            PANEL_LABEL => surfaces.panel,
            "main" => surfaces.main,
            _ => 0,
        };
        let mut process = 0;
        (window != 0
            && unsafe { IsWindow(window) } != 0
            && unsafe { GetWindowThreadProcessId(window, &mut process) } != 0
            && process == std::process::id())
        .then_some(window)
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
    fn main_window_style(style: isize, extended_style: isize) -> bool {
        // Electron utility windows share the executable and class. Require a resizable
        // top-level application frame with the same minimize/maximize controls as Codex.
        // The custom Codex title bar removes WS_CAPTION when restored/maximized.
        // Keep resize/min/max controls; never follow child, popup, tool,
        // click-through, or non-activating surfaces from that same process.
        const FRAME_AND_CONTROLS: isize = 0x00070000;
        style & FRAME_AND_CONTROLS == FRAME_AND_CONTROLS
            && style & 0xc0000000 == 0
            && extended_style & 0x080000a0 == 0
    }
    fn process_identity(process: u32) -> Option<(String, String, Arc<VerifiedProcess>)> {
        unsafe {
            // Keep this verified process object alive. Its zero-time wait distinguishes
            // an exited process from a subsequently reused PID without reopening it per frame.
            let handle = OpenProcess(0x1000 | 0x00100000, 0, process);
            if handle == 0 {
                return None;
            }
            let identity = Arc::new(VerifiedProcess(handle));
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
                Some((path, family, identity))
            })();
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
                || !main_window_style(
                    GetWindowLongPtrW(window, -16),
                    GetWindowLongPtrW(window, -20),
                )
            {
                return None;
            }
            let mut process = 0;
            let thread = GetWindowThreadProcessId(window, &mut process);
            if process == 0 || process == std::process::id() {
                return None;
            }
            let mut class = [0u16; 128];
            let length = GetClassNameW(window, class.as_mut_ptr(), class.len() as i32);
            if length <= 0 {
                return None;
            }
            let class = String::from_utf16(&class[..length as usize]).ok()?;
            let (path, family, identity) = process_identity(process)?;
            let accepted =
                class == "Chrome_WidgetWin_1" && valid_packaged_executable(&path, &family);
            #[cfg(feature = "e2e")]
            let accepted = accepted || valid_fixture(process, &path, &class);
            accepted.then_some(Host {
                window,
                process,
                thread,
                class,
                identity,
            })
        }
    }
    fn host_still_valid(host: &Host) -> bool {
        host_quick_valid(host)
            && trusted_window(host.window).is_some_and(|current| current.process == host.process)
    }
    fn host_quick_valid(host: &Host) -> bool {
        unsafe {
            if WaitForSingleObject(host.identity.0, 0) != 258
                || IsWindowVisible(host.window) == 0
                || IsIconic(host.window) != 0
                || GetAncestor(host.window, 2) != host.window
                || !main_window_style(
                    GetWindowLongPtrW(host.window, -16),
                    GetWindowLongPtrW(host.window, -20),
                )
            {
                return false;
            }
            let mut process = 0;
            if GetWindowThreadProcessId(host.window, &mut process) != host.thread
                || process != host.process
            {
                return false;
            }
            let mut class = [0u16; 128];
            let length = GetClassNameW(host.window, class.as_mut_ptr(), class.len() as i32);
            length > 0 && String::from_utf16_lossy(&class[..length as usize]) == host.class
        }
    }
    const FRAME: Duration = Duration::from_millis(16);
    const WATCHDOG: Duration = Duration::from_millis(500);
    #[derive(Clone, Copy, Debug, PartialEq)]
    enum HostEvent {
        Ignore,
        Geometry,
        Refresh,
        Destroyed,
    }
    fn host_event(event: u32, window: Hwnd, object: i32, child: i32, bound: Hwnd) -> HostEvent {
        if event == 3 {
            return HostEvent::Refresh;
        } // foreground, including our own surfaces
        if bound == 0 || window != bound || object != 0 || child != 0 {
            return HostEvent::Ignore;
        }
        match event {
            0x8001 => HostEvent::Destroyed,
            0x800b => HostEvent::Geometry,
            0x8002 | 0x8003 | 0x000a | 0x000b | 0x0016 | 0x0017 => HostEvent::Refresh,
            _ => HostEvent::Ignore,
        }
    }
    thread_local! {
        static BOUND: Cell<Hwnd> = const { Cell::new(0) };
        static DIRTY: Cell<bool> = const { Cell::new(false) };
        static REFRESH: Cell<bool> = const { Cell::new(false) };
        static DESTROYED: Cell<bool> = const { Cell::new(false) };
    }
    unsafe extern "system" fn on_event(
        _: isize,
        event: u32,
        window: Hwnd,
        object: i32,
        child: i32,
        _: u32,
        _: u32,
    ) {
        // OUTOFCONTEXT callbacks run on our hook thread. Never call Tauri, mutate
        // the host, or perform identity queries from a potentially reentrant hook.
        match BOUND.with(|bound| host_event(event, window, object, child, bound.get())) {
            HostEvent::Ignore => (),
            HostEvent::Geometry => DIRTY.with(|value| value.set(true)),
            HostEvent::Refresh => {
                DIRTY.with(|value| value.set(true));
                REFRESH.with(|value| value.set(true));
            }
            HostEvent::Destroyed => {
                DIRTY.with(|value| value.set(true));
                REFRESH.with(|value| value.set(true));
                DESTROYED.with(|value| value.set(true));
            }
        }
    }
    struct EventHooks(Vec<isize>);
    impl Drop for EventHooks {
        fn drop(&mut self) {
            for hook in &self.0 {
                unsafe {
                    UnhookWinEvent(*hook);
                }
            }
        }
    }
    pub(super) fn start_watcher(
        app: tauri::AppHandle,
        state: TitlebarController,
    ) -> tauri::Result<()> {
        std::thread::Builder::new()
            .name("pulse-titlebar-events".into())
            .spawn(move || {
                // Zero flags = OUTOFCONTEXT: no DLL injection or host message subclassing.
                let hooks = EventHooks(
                    [
                        (3, 3),
                        (0x800b, 0x800b),
                        (0x8001, 0x8003),
                        (0x000a, 0x000b),
                        (0x0016, 0x0017),
                    ]
                    .into_iter()
                    .filter_map(|(first, last)| {
                        let hook = unsafe { SetWinEventHook(first, last, 0, on_event, 0, 0, 0) };
                        (hook != 0).then_some(hook)
                    })
                    .collect(),
                );
                let degraded = hooks.0.len() != 5;
                if degraded {
                    log::warn!(
                        "Pulse titlebar events unavailable; using bounded watchdog fallback"
                    );
                }
                let watchdog = if degraded {
                    Duration::from_millis(250)
                } else {
                    WATCHDOG
                };
                let pending = Arc::new(AtomicBool::new(false));
                let full = Arc::new(AtomicBool::new(true));
                let invalidate = Arc::new(AtomicBool::new(false));
                let mut dirty = true;
                let mut last_frame = Instant::now() - FRAME;
                let mut last_watchdog = Instant::now() - watchdog;
                loop {
                    let main = state.surfaces.lock().map(|value| value.main).unwrap_or(0);
                    if main == 0 || unsafe { IsWindow(main) } == 0 {
                        break;
                    }
                    BOUND.with(|bound| {
                        bound.set(
                            state
                                .host
                                .lock()
                                .ok()
                                .and_then(|value| value.as_ref().map(|host| host.window))
                                .unwrap_or(0),
                        )
                    });
                    let mut message = Message::default();
                    while unsafe { PeekMessageW(&mut message, 0, 0, 0, 1) } != 0 {
                        if message.message == 0x0012 {
                            return;
                        }
                        unsafe {
                            TranslateMessage(&message);
                            DispatchMessageW(&message);
                        }
                    }
                    dirty |= DIRTY.with(|value| value.replace(false));
                    if REFRESH.with(|value| value.replace(false)) {
                        full.store(true, Ordering::Release);
                    }
                    if DESTROYED.with(|value| value.replace(false)) {
                        invalidate.store(true, Ordering::Release);
                    }
                    if last_watchdog.elapsed() >= watchdog {
                        last_watchdog = Instant::now();
                        full.store(true, Ordering::Release);
                        dirty = true;
                    }
                    if dirty
                        && last_frame.elapsed() >= FRAME
                        && !pending.swap(true, Ordering::AcqRel)
                    {
                        dirty = false;
                        last_frame = Instant::now();
                        let (job_app, job_state, job_pending, job_full, job_invalidate) = (
                            app.clone(),
                            state.clone(),
                            pending.clone(),
                            full.clone(),
                            invalidate.clone(),
                        );
                        if app
                            .run_on_main_thread(move || {
                                if job_invalidate.swap(false, Ordering::AcqRel) {
                                    if let Ok(mut host) = job_state.host.lock() {
                                        *host = None;
                                    }
                                }
                                tick_inner(
                                    &job_app,
                                    &job_state,
                                    job_full.swap(false, Ordering::AcqRel),
                                );
                                job_pending.store(false, Ordering::Release);
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                    let remaining = watchdog.saturating_sub(last_watchdog.elapsed());
                    let wait = if pending.load(Ordering::Acquire) {
                        FRAME
                    } else if dirty {
                        // Keep the original frame deadline when more events arrive;
                        // repeatedly waiting another full frame would add avoidable lag.
                        FRAME.saturating_sub(last_frame.elapsed()).min(remaining)
                    } else {
                        remaining
                    };
                    // This is the hook's actual message loop; no 16ms idle polling.
                    unsafe {
                        MsgWaitForMultipleObjectsEx(
                            0,
                            std::ptr::null(),
                            wait.as_millis().clamp(1, 500) as u32,
                            0x04ff,
                            0x0004,
                        );
                    }
                }
            })
            .map(|_| ())
            .map_err(tauri::Error::Io)
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
            .and_then(|value| value.clone())
            .filter(host_still_valid)
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
        if unsafe { GetAncestor(GetForegroundWindow(), 2) } != foreground
            || !host_still_valid(&host)
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
            .and_then(|value| value.clone())
            .filter(host_still_valid);
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
            if !host_quick_valid(&host) {
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
        tick_inner(app, state, true);
    }
    fn tick_inner(app: &tauri::AppHandle, state: &TitlebarController, full_validation: bool) {
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
        let last = state
            .host
            .lock()
            .ok()
            .and_then(|value| value.clone())
            .filter(|host| {
                if full_validation {
                    host_still_valid(host)
                } else {
                    host_quick_valid(host)
                }
            });
        let current = if let Some(host) = last.as_ref().filter(|host| host.window == foreground) {
            Some(host.clone())
        } else if full_validation && !own_badge && !own_panel {
            trusted_window(foreground)
        } else {
            None
        };
        if let Ok(mut saved) = state.host.lock() {
            *saved = current.clone().or_else(|| last.clone());
        }
        let host_found = current.is_some() || last.is_some();
        let active = current.or_else(|| {
            (own_badge || (own_panel && state.popup.load(Ordering::SeqCst)))
                .then_some(last)
                .flatten()
        });
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
        fn restored_captionless_codex_keeps_its_main_window_identity() {
            // Observed on the real Store client: minimizing temporarily restores
            // WS_CAPTION; restoring its custom title bar removes it again.
            assert!(main_window_style(0x15070000, 0x00240100));
            assert!(main_window_style(0x14c70000, 0x00240100));
            assert!(!main_window_style(0x15030000, 0x00240100));
            assert!(!main_window_style(0x55070000, 0x00240100));
            assert!(!main_window_style(0x95070000, 0x00240100));
            assert!(!main_window_style(0x15070000, 0x00240180));
            assert!(!main_window_style(0x15070000, 0x08240100));
            assert!(!main_window_style(0x15070000, 0x00240120));
        }
        #[test]
        fn location_events_only_follow_bound_top_level_window() {
            assert_eq!(host_event(0x800b, 42, 0, 0, 42), HostEvent::Geometry);
            assert_eq!(host_event(0x800b, 41, 0, 0, 42), HostEvent::Ignore);
            assert_eq!(host_event(0x800b, 42, -8, 0, 42), HostEvent::Ignore);
            assert_eq!(host_event(0x800b, 42, 0, 1, 42), HostEvent::Ignore);
            assert_eq!(host_event(0x800b, 0, 0, 0, 0), HostEvent::Ignore);
        }
        #[test]
        fn foreground_is_global_but_destroy_and_minimize_require_bound_host() {
            assert_eq!(host_event(3, 123, 0, 0, 42), HostEvent::Refresh);
            assert_eq!(host_event(0x8001, 42, 0, 0, 42), HostEvent::Destroyed);
            assert_eq!(host_event(0x8001, 41, 0, 0, 42), HostEvent::Ignore);
            assert_eq!(host_event(0x0016, 42, 0, 0, 42), HostEvent::Refresh);
            assert_eq!(host_event(0x8003, 42, 0, 0, 42), HostEvent::Refresh);
        }
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
            assert!(main_window_style(0x14c70000, 0));
            assert!(main_window_style(0x00cf0000, 0));
            assert!(!main_window_style(0x80000000, 0));
            assert!(!main_window_style(0x00c00000, 0));
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
