//! Read-only installation diagnostics and explicitly requested, snapshot-checked repairs.
use crate::pulse_desktop::PulsePaths;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationEntry {
    pub id: String,
    pub status: String,
    pub location: String,
    pub target_path: Option<String>,
    #[serde(default)]
    pub registered_target_path: Option<String>,
    pub can_repair: bool,
    pub detail_code: String,
    #[serde(default, skip_serializing)]
    state_stamp: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationInspection {
    supported: bool,
    executable: PathBuf,
    data_directory: PathBuf,
    codex_home: PathBuf,
    snapshot_id: String,
    entries: Vec<InstallationEntry>,
    checked_at: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairResult {
    id: String,
    outcome: String,
    detail_code: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationRepairReport {
    results: Vec<RepairResult>,
    inspection: InstallationInspection,
}
#[derive(Clone)]
struct Snapshot {
    id: String,
    executable: PathBuf,
    data: PathBuf,
    home: PathBuf,
    entries: Vec<InstallationEntry>,
}
static SNAPSHOTS: LazyLock<Mutex<VecDeque<Snapshot>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
static REPAIR: Mutex<()> = Mutex::new(());

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn host_home() -> Result<PathBuf, String> {
    if let Some(home) = std::env::var_os("CODEX_HOME") {
        let home = PathBuf::from(home);
        if home.is_absolute() {
            return Ok(home);
        }
        return Err("CODEX_HOME must be an absolute directory".into());
    }
    dirs::home_dir()
        .map(|home| home.join(".codex"))
        .ok_or_else(|| "Cannot locate Codex home".into())
}
fn normalized(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/");
    let value = value
        .strip_prefix("//?/")
        .unwrap_or(&value)
        .trim_end_matches('/');
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value.to_string()
    }
}
fn same_path(a: &Path, b: &Path) -> bool {
    normalized(a) == normalized(b)
}
fn local_absolute(path: &Path) -> bool {
    #[cfg(windows)]
    {
        let text = normalized(path);
        let bytes = text.as_bytes();
        bytes.len() > 3 && bytes[0].is_ascii_alphabetic() && bytes[1..3] == *b":/"
    }
    #[cfg(not(windows))]
    {
        path.is_absolute()
    }
}
fn plain_file(path: &Path) -> Result<Vec<u8>, ()> {
    // Reject redirected cache/config paths, including junctions on any existing ancestor.
    for ancestor in path.ancestors() {
        if let Ok(meta) = fs::symlink_metadata(ancestor) {
            if meta.file_type().is_symlink() {
                return Err(());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(());
                }
            }
        }
    }
    let metadata = fs::metadata(path).map_err(|_| ())?;
    if !metadata.is_file() || metadata.len() > 1_048_576 {
        return Err(());
    }
    fs::read(path).map_err(|_| ())
}
fn entry(id: &str, location: &Path, status: &str, detail: &str) -> InstallationEntry {
    InstallationEntry {
        id: id.into(),
        status: status.into(),
        location: location.to_string_lossy().into(),
        target_path: None,
        registered_target_path: None,
        can_repair: false,
        detail_code: detail.into(),
        state_stamp: String::new(),
    }
}
fn plugin_entry(home: &Path, executable: &Path, data: &Path) -> InstallationEntry {
    let config = home.join("config.toml");
    let mut result = entry("codexPlugin", &config, "unavailable", "hostConfirmation");
    let mut proof = Vec::new();
    let inspect = || -> Result<InstallationEntry, ()> {
        let mut result = result.clone();
        if !config.exists() {
            result.status = "notConfigured".into();
            result.detail_code = "notConfigured".into();
            return Ok(result);
        }
        let bytes = plain_file(&config)?;
        let config: toml::Value =
            toml::from_str(std::str::from_utf8(&bytes).map_err(|_| ())?).map_err(|_| ())?;
        let enabled = config
            .get("plugins")
            .and_then(|v| v.get("codex-pulse@codex-pulse-local"))
            .and_then(|v| v.get("enabled"))
            .and_then(|v| v.as_bool());
        if enabled != Some(true) {
            result.status = "notConfigured".into();
            result.detail_code = "pluginNotEnabled".into();
            return Ok(result);
        }
        let marketplace = config
            .get("marketplaces")
            .and_then(|v| v.get("codex-pulse-local"))
            .ok_or(())?;
        if marketplace.get("source_type").and_then(|v| v.as_str()) != Some("local") {
            return Err(());
        }
        let source = PathBuf::from(
            marketplace
                .get("source")
                .and_then(|v| v.as_str())
                .ok_or(())?,
        );
        if !local_absolute(&source) {
            return Err(());
        }
        result.registered_target_path = Some(source.to_string_lossy().into());
        result.target_path = Some(source.to_string_lossy().into());
        let cache = home.join("plugins/cache/codex-pulse-local/codex-pulse");
        let mut versions = Vec::new();
        if cache.exists() {
            for item in fs::read_dir(&cache).map_err(|_| ())? {
                let item = item.map_err(|_| ())?;
                if item.file_type().map_err(|_| ())?.is_dir() {
                    versions.push(item.path());
                }
            }
        }
        if versions.len() != 1 {
            // A marketplace registration is not proof of installation; multiple cached versions
            // are not proof of which version the host currently loaded.
            result.detail_code = "hostConfirmation".into();
            return Ok(result);
        }
        let mcp_path = versions[0].join("mcp.json");
        let mcp: serde_json::Value =
            serde_json::from_slice(&plain_file(&mcp_path)?).map_err(|_| ())?;
        let server = mcp
            .get("mcpServers")
            .and_then(|v| v.get("codex-pulse"))
            .ok_or(())?;
        let command = server.get("command").and_then(|v| v.as_str()).ok_or(())?;
        if !["codexpulse.exe", "codex-pulse.exe"].contains(&command.to_ascii_lowercase().as_str())
            || server.get("args") != Some(&serde_json::json!(["--mcp"]))
        {
            return Err(());
        }
        let env = server.get("env").ok_or(())?;
        let search = env.get("PATH").and_then(|v| v.as_str()).ok_or(())?;
        let first = search
            .split(if cfg!(windows) { ';' } else { ':' })
            .next()
            .ok_or(())?;
        let target = PathBuf::from(first).join(command);
        let profile = PathBuf::from(
            env.get("PULSE_DATA_DIR")
                .and_then(|v| v.as_str())
                .ok_or(())?,
        );
        if !local_absolute(&target) || !local_absolute(&profile) {
            return Err(());
        }
        result.target_path = Some(target.to_string_lossy().into());
        let moved_default_profile = !target.exists()
            && !profile.exists()
            && target
                .parent()
                .is_some_and(|parent| same_path(&profile, &parent.join("data")));
        let expected_source = executable.parent().ok_or(())?.join("integrations/codex");
        let standard_source = normalized(&source).ends_with("/integrations/codex");
        if !same_path(&profile, data) && !moved_default_profile {
            result.status = "otherInstallation".into();
            result.detail_code = "otherProfile".into();
        } else if source.is_dir() && !same_path(&source, &expected_source) {
            result.status = "otherInstallation".into();
            result.detail_code = "otherInstallation".into();
        } else if !source.is_dir() && !standard_source {
            result.status = "unavailable".into();
            result.detail_code = "hostConfirmation".into();
        } else if same_path(&target, executable) && target.is_file() && source.is_dir() {
            result.status = "current".into();
            result.detail_code = "pluginHostConfirmation".into();
        } else if target.exists() && !same_path(&target, executable) {
            result.status = "otherInstallation".into();
            result.detail_code = "otherInstallation".into();
        } else {
            result.status = "stale".into();
            result.detail_code = if moved_default_profile {
                "movedDefaultProfile"
            } else {
                "pluginReinstall"
            }
            .into();
            result.can_repair = true;
        }
        Ok(result)
    };
    if let Ok(found) = inspect() {
        result = found;
    }
    // Fingerprint the registration, all cached manifests, and existence observations. Never
    // return host configuration contents to a renderer or use a renderer-provided path.
    proof.extend(plain_file(&config).unwrap_or_default());
    let cache = home.join("plugins/cache/codex-pulse-local/codex-pulse");
    if let Ok(versions) = fs::read_dir(cache) {
        let mut paths: Vec<_> = versions
            .filter_map(Result::ok)
            .map(|item| item.path())
            .collect();
        paths.sort();
        for path in paths {
            proof.extend(path.to_string_lossy().as_bytes());
            proof.extend(plain_file(&path.join("mcp.json")).unwrap_or_default());
        }
    }
    proof.extend(
        format!(
            "{:?}|{:?}|{}|{}|{}",
            result.target_path,
            result.registered_target_path,
            result.status,
            result.detail_code,
            result.can_repair
        )
        .as_bytes(),
    );
    result.state_stamp = digest(&proof);
    result
}

#[cfg(windows)]
fn windows_helper(
    paths: &PulsePaths,
    executable: &Path,
    app_name: &str,
    repair: Option<&InstallationEntry>,
) -> Result<serde_json::Value, String> {
    use std::os::windows::process::CommandExt;
    let script = paths
        .temporary
        .join(format!("pulse-installation-{}.ps1", uuid::Uuid::new_v4()));
    fs::write(
        &script,
        include_str!("../../scripts/pulse-installation.ps1"),
    )
    .map_err(|_| "Cannot prepare installation check")?;
    let powershell = Path::new(&std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into()))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut command = std::process::Command::new(powershell);
    command
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
        .arg("-AppName")
        .arg(app_name)
        .creation_flags(0x08000000);
    if let Some(repair) = repair {
        command.args([
            "-Mode",
            "Repair",
            "-ItemId",
            &repair.id,
            "-ExpectedStamp",
            &repair.state_stamp,
        ]);
    }
    // A redirected Windows shell folder or unavailable COM server must not leave Settings busy.
    use std::{
        io::Read,
        process::Stdio,
        time::{Duration, Instant},
    };
    let output = (|| {
        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| "Windows installation check could not start")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Cannot read installation check")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Cannot read installation check")?;
        let out = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.take(2_097_152).read_to_end(&mut bytes);
            bytes
        });
        let err = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.take(65_536).read_to_end(&mut bytes);
        });
        let started = Instant::now();
        let status = loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|_| "Windows installation check did not complete")?
            {
                break Ok(status);
            }
            if started.elapsed() > Duration::from_secs(30) {
                let _ = child.kill();
                let _ = child.wait();
                break Err("Windows installation check timed out");
            }
            std::thread::sleep(Duration::from_millis(50));
        };
        let stdout = out.join().map_err(|_| "Cannot read installation check")?;
        let _ = err.join();
        let status = status?;
        Ok::<_, &str>((status, stdout))
    })();
    let _ = fs::remove_file(&script);
    let (status, stdout) = output.map_err(str::to_string)?;
    if !status.success() {
        return Err("Windows could not complete this installation action".into());
    }
    serde_json::from_slice(&stdout)
        .map_err(|_| "Windows did not confirm the installation action".into())
}
fn read_entries(
    paths: &PulsePaths,
    executable: &Path,
    home: &Path,
    app_name: &str,
) -> Vec<InstallationEntry> {
    #[cfg(windows)]
    let mut entries = windows_helper(paths, executable, app_name, None)
        .ok()
        .and_then(|value| {
            serde_json::from_value::<Vec<InstallationEntry>>(value["entries"].clone()).ok()
        })
        .unwrap_or_else(|| {
            ["desktop", "startMenu", "startup"]
                .map(|id| entry(id, Path::new(""), "unavailable", "unreadable"))
                .to_vec()
        });
    #[cfg(not(windows))]
    let mut entries = {
        let _ = app_name;
        Vec::new()
    };
    entries.push(plugin_entry(home, executable, &paths.data));
    entries
}
fn inspect(
    paths: &PulsePaths,
    executable: &Path,
    home: &Path,
    app_name: &str,
) -> Result<InstallationInspection, String> {
    let entries = read_entries(paths, executable, home, app_name);
    let id = uuid::Uuid::new_v4().to_string();
    let snapshot = Snapshot {
        id: id.clone(),
        executable: executable.into(),
        data: paths.data.clone(),
        home: home.into(),
        entries: entries.clone(),
    };
    let mut stored = SNAPSHOTS.lock().map_err(|_| "Installation check is busy")?;
    if stored.len() >= 16 {
        stored.pop_front();
    }
    stored.push_back(snapshot);
    Ok(InstallationInspection {
        supported: cfg!(windows),
        executable: executable.into(),
        data_directory: paths.data.clone(),
        codex_home: home.into(),
        snapshot_id: id,
        entries,
        checked_at: chrono::Utc::now().to_rfc3339(),
    })
}
#[tauri::command]
pub async fn inspect_pulse_installation(
    app: tauri::AppHandle,
    paths: tauri::State<'_, PulsePaths>,
) -> Result<InstallationInspection, String> {
    let paths = paths.inner().clone();
    let app_name = app.package_info().name.clone();
    tauri::async_runtime::spawn_blocking(move || {
        inspect(
            &paths,
            &std::env::current_exe().map_err(|_| "Cannot locate executable")?,
            &host_home()?,
            &app_name,
        )
    })
    .await
    .map_err(|_| "Installation check did not complete".to_string())?
}
#[tauri::command]
pub async fn repair_pulse_installation(
    app: tauri::AppHandle,
    paths: tauri::State<'_, PulsePaths>,
    snapshot_id: String,
    entry_ids: Vec<String>,
) -> Result<InstallationRepairReport, String> {
    let paths = paths.inner().clone();
    let app_name = app.package_info().name.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = REPAIR
            .try_lock()
            .map_err(|_| "Installation repair is already running")?;
        let executable = std::env::current_exe().map_err(|_| "Cannot locate executable")?;
        let home = host_home()?;
        let snapshot = SNAPSHOTS
            .lock()
            .map_err(|_| "Installation check is busy")?
            .iter()
            .find(|value| value.id == snapshot_id)
            .cloned()
            .ok_or("Run a new installation check before repairing")?;
        if snapshot.executable != executable
            || snapshot.data != paths.data
            || snapshot.home != home
            || entry_ids.len() > 4
        {
            return Err("Installation context changed; check again".into());
        }
        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for id in entry_ids {
            if !seen.insert(id.clone()) {
                continue;
            }
            let checked = snapshot
                .entries
                .iter()
                .find(|entry| entry.id == id)
                .ok_or("Unknown installation entry")?;
            let current = read_entries(&paths, &executable, &home, &app_name)
                .into_iter()
                .find(|entry| entry.id == id)
                .ok_or("Installation entry is unavailable")?;
            let (outcome, detail) = if checked.state_stamp != current.state_stamp {
                ("changedSinceCheck".into(), "changedSinceCheck".into())
            } else if !current.can_repair {
                ("skipped".into(), current.detail_code.clone())
            } else if id == "codexPlugin" {
                match crate::pulse_integration::prepare(&executable, &paths.data).and_then(
                    |prepared| {
                        crate::pulse_integration::open_installation_link(&prepared.deep_link)
                    },
                ) {
                    Ok(()) => ("prepared".into(), "pluginReinstall".into()),
                    Err(_) => ("failed".into(), "repairFailed".into()),
                }
            } else {
                #[cfg(windows)]
                let action = windows_helper(&paths, &executable, &app_name, Some(&current));
                #[cfg(not(windows))]
                let action: Result<serde_json::Value, String> = Err("Unsupported".into());
                match action {
                    Ok(value) => (
                        value["outcome"].as_str().unwrap_or("failed").into(),
                        value["detailCode"]
                            .as_str()
                            .unwrap_or("repairFailed")
                            .into(),
                    ),
                    Err(_) => ("failed".into(), "repairFailed".into()),
                }
            };
            results.push(RepairResult {
                id,
                outcome,
                detail_code: detail,
            });
        }
        Ok(InstallationRepairReport {
            results,
            inspection: inspect(&paths, &executable, &home, &app_name)?,
        })
    })
    .await
    .map_err(|_| "Installation repair did not complete".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (PathBuf, PathBuf, PathBuf) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../.local/tests")
            .join(format!("pulse-installation-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        (
            root.join("home"),
            root.join("current/CodexPulse.exe"),
            root.join("data"),
        )
    }
    fn configure(home: &Path, target: &Path, data: &Path, enabled: bool) {
        fs::create_dir_all(home).unwrap();
        let source = target.parent().unwrap().join("integrations/codex");
        fs::write(home.join("config.toml"), format!("[marketplaces.codex-pulse-local]\nsource_type = 'local'\nsource = '{}'\n[plugins.'codex-pulse@codex-pulse-local']\nenabled = {}\n", source.display(), enabled)).unwrap();
        let cache = home.join("plugins/cache/codex-pulse-local/codex-pulse/1");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("mcp.json"), serde_json::to_vec(&serde_json::json!({"mcpServers":{"codex-pulse":{"command":"CodexPulse.exe","args":["--mcp"],"env":{"PATH":target.parent().unwrap().to_string_lossy(),"PULSE_DATA_DIR":data}}}})).unwrap()).unwrap();
    }
    #[test]
    fn unconfigured_and_disabled_are_not_repairable() {
        let (home, exe, data) = fixture();
        assert_eq!(plugin_entry(&home, &exe, &data).status, "notConfigured");
        configure(&home, &exe, &data, false);
        let found = plugin_entry(&home, &exe, &data);
        assert_eq!(found.status, "notConfigured");
        assert!(!found.can_repair);
        fs::remove_dir_all(home.parent().unwrap()).unwrap();
    }
    #[test]
    fn missing_old_runtime_repair_requires_host_confirmation_and_preserves_config() {
        let (home, exe, data) = fixture();
        let old = home.join("old/CodexPulse.exe");
        configure(&home, &old, &data, true);
        let before = fs::read(home.join("config.toml")).unwrap();
        let stale = plugin_entry(&home, &exe, &data);
        assert_eq!(stale.status, "stale");
        assert!(stale.can_repair);
        fs::create_dir_all(old.parent().unwrap()).unwrap();
        fs::write(&old, b"fixture").unwrap();
        let other = plugin_entry(&home, &exe, &data);
        assert_eq!(other.status, "otherInstallation");
        assert!(!other.can_repair);
        assert_ne!(other.state_stamp, stale.state_stamp);
        assert_eq!(fs::read(home.join("config.toml")).unwrap(), before);
        fs::remove_dir_all(home.parent().unwrap()).unwrap();
    }
    #[test]
    fn multiple_cached_versions_and_other_profile_are_never_overwritten() {
        let (home, exe, data) = fixture();
        configure(&home, &exe, &home.join("other-data"), true);
        let other = plugin_entry(&home, &exe, &data);
        assert_eq!(other.detail_code, "otherProfile");
        assert!(!other.can_repair);
        fs::create_dir_all(home.join("plugins/cache/codex-pulse-local/codex-pulse/2")).unwrap();
        let ambiguous = plugin_entry(&home, &exe, &data);
        assert_eq!(ambiguous.status, "unavailable");
        assert!(!ambiguous.can_repair);
        fs::remove_dir_all(home.parent().unwrap()).unwrap();
    }
    #[test]
    fn moved_default_profile_and_missing_marketplace_are_reinstallable_without_host_writes() {
        let (home, exe, data) = fixture();
        let old = home.join("old/CodexPulse.exe");
        configure(&home, &old, &old.parent().unwrap().join("data"), true);
        let moved = plugin_entry(&home, &exe, &data);
        assert!(moved.can_repair);
        assert_eq!(moved.detail_code, "movedDefaultProfile");
        configure(&home, &exe, &data, true);
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(&exe, b"fixture").unwrap();
        let missing_source = plugin_entry(&home, &exe, &data);
        assert!(missing_source.can_repair);
        assert_eq!(missing_source.status, "stale");
        let source = exe.parent().unwrap().join("integrations/codex");
        fs::create_dir_all(source).unwrap();
        let current = plugin_entry(&home, &exe, &data);
        assert_eq!(current.status, "current");
        assert_ne!(current.state_stamp, missing_source.state_stamp);
        fs::remove_dir_all(home.parent().unwrap()).unwrap();
    }
}
