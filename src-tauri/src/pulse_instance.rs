//! Reopening a shortcut focuses the existing window for the same portable profile.
//! Different data roots intentionally remain independent (including isolated tests).
use sha2::{Digest, Sha256};
use std::path::Path;

fn profile_key(path: &Path) -> String {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let normalized = canonical
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    format!(
        "io.github.zhulongqihan.codexpulse.profile.{:x}",
        Sha256::digest(normalized.as_bytes())
    )
}

#[cfg(windows)]
pub fn plugin(paths: &crate::pulse_desktop::PulsePaths) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri::Manager;
    tauri_plugin_single_instance::Builder::new()
        .windows_key(profile_key(&paths.data))
        .callback(|app, arguments, _| {
            if arguments.iter().any(|argument| argument == "--quit") {
                crate::pulse_desktop::save_widget_position(app);
                app.exit(0);
            } else if !arguments.iter().any(|argument| argument == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_profile_keys_are_stable_and_keep_distinct_directories_isolated() {
        let base = std::env::temp_dir().join(format!("pulse-profile-{}", uuid::Uuid::new_v4()));
        let first = base.join("First profile");
        let second = base.join("Second profile");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        assert_eq!(profile_key(&first), profile_key(&first.join(".")));
        #[cfg(windows)]
        assert_eq!(
            profile_key(&first),
            profile_key(Path::new(&first.to_string_lossy().to_uppercase()))
        );
        assert_ne!(profile_key(&first), profile_key(&second));
        // Only the two empty, owned fixture directories are removed.
        std::fs::remove_dir(first).unwrap();
        std::fs::remove_dir(second).unwrap();
        std::fs::remove_dir(base).unwrap();
    }
}
