//! The application button and portable command share this exact shortcut implementation.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreatedShortcuts {
    pub desktop: PathBuf,
    pub start_menu: PathBuf,
}

#[cfg(windows)]
fn create(temporary: &Path) -> Result<CreatedShortcuts, String> {
    use std::os::windows::process::CommandExt;
    let executable = std::env::current_exe().map_err(|_| "Cannot locate Codex Pulse executable")?;
    let script = temporary.join(format!("create-shortcuts-{}.ps1", uuid::Uuid::new_v4()));
    std::fs::write(
        &script,
        include_str!("../../scripts/Create-Codex-Pulse-Shortcuts.ps1"),
    )
    .map_err(|_| "Cannot prepare the shortcut helper in the Pulse data folder")?;
    let powershell = Path::new(&std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into()))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let output = std::process::Command::new(powershell)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&script)
        .arg("-Executable")
        .arg(executable)
        .arg("-Json")
        .creation_flags(0x08000000)
        .output();
    let _ = std::fs::remove_file(script);
    let output = output.map_err(|_| "Cannot start the Windows shortcut helper")?;
    if !output.status.success() {
        return Err("Could not create shortcuts. Check that Desktop and Start menu folders are writable, then retry.".into());
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "Windows did not confirm the created shortcuts".into())
}

#[tauri::command]
pub async fn create_pulse_shortcuts(
    paths: tauri::State<'_, crate::pulse_desktop::PulsePaths>,
) -> Result<CreatedShortcuts, String> {
    #[cfg(windows)]
    {
        let temporary = paths.temporary.clone();
        tauri::async_runtime::spawn_blocking(move || create(&temporary))
            .await
            .map_err(|_| "Shortcut helper did not complete".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = paths;
        Err("Desktop and Start menu shortcuts are available in the Windows app only".into())
    }
}
