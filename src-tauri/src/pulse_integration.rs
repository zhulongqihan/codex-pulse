//! Prepare the bundled, opt-in Codex plugin without editing the host's configuration.
use serde::Serialize;
use serde_json::Value;
use std::{
    ffi::{OsStr, OsString},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

const MARKETPLACE: &str = include_str!("../../integrations/codex/.agents/plugins/marketplace.json");
const PLUGIN: &str = include_str!("../../integrations/codex/plugins/codex-pulse/plugin.json");
const MCP: &str = include_str!("../../integrations/codex/plugins/codex-pulse/mcp.json");
const ICON: &[u8] = include_bytes!("../../integrations/codex/plugins/codex-pulse/assets/icon.png");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedCodexIntegration {
    pub marketplace_path: PathBuf,
    pub deep_link: String,
    pub opened: bool,
}

fn is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Junctions and other reparse points must not redirect plugin writes.
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    false
}

fn check_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Cannot inspect the Codex plugin directory: {error}"))?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err("The Codex plugin directory must be a regular directory without links".into());
    }
    Ok(())
}

fn check_ancestors(path: &Path) -> Result<(), String> {
    for directory in path.ancestors() {
        check_directory(directory)?;
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        check_ancestors(parent)?;
    }
    match fs::create_dir(path) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(format!("Cannot create the Codex plugin directory: {error}")),
    }
    check_directory(path)
}

fn check_destination(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_link(&metadata) || !metadata.is_file() => {
            Err("A Codex plugin file is a link or an unexpected directory".into())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot inspect a Codex plugin file: {error}")),
    }
}

fn replace_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing Codex plugin directory")?;
    check_ancestors(parent)?;
    check_destination(path)?;
    if fs::read(path).is_ok_and(|existing| existing == contents) {
        return Ok(());
    }
    let temporary = parent.join(format!(".pulse-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("Cannot prepare a Codex plugin file: {error}"))?;
        file.write_all(contents)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Cannot write a Codex plugin file: {error}"))?;
        drop(file);
        check_ancestors(parent)?;
        check_destination(path)?;
        // Replace the directory entry instead of truncating an existing hard link.
        fs::rename(&temporary, path)
            .map_err(|error| format!("Cannot replace a Codex plugin file: {error}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn executable_search_path(
    installation: &Path,
    inherited: Option<&OsStr>,
) -> Result<String, String> {
    #[cfg(windows)]
    if installation.as_os_str().to_string_lossy().contains(';') {
        return Err("Codex integration cannot use an application folder containing a semicolon. Move Pulse to a folder without ';' and retry.".into());
    }
    let paths = std::iter::once(installation.to_path_buf())
        .chain(inherited.into_iter().flat_map(std::env::split_paths));
    std::env::join_paths(paths)
        .map_err(|_| "Cannot prepare the executable search path for the Codex plugin")?
        .into_string()
        .map_err(|_| "The executable search path cannot be represented in the Codex plugin".into())
}

pub(crate) fn prepare(executable: &Path, data: &Path) -> Result<PreparedCodexIntegration, String> {
    if !executable.is_absolute() || !data.is_absolute() {
        return Err("Codex integration requires absolute application and data paths".into());
    }
    let executable_name = executable
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or("The application path cannot be represented in the Codex plugin")?;
    let data_text = data
        .to_str()
        .ok_or("The data path cannot be represented in the Codex plugin")?;
    let installation = executable.parent().ok_or("Missing application directory")?;
    // Windows environment lookup is case-insensitive; the fallback also makes
    // the conventional mixed-case spelling explicit for other launch contexts.
    let inherited_path = std::env::var_os("PATH").or_else(|| std::env::var_os("Path"));
    let search_path = executable_search_path(installation, inherited_path.as_deref())?;
    check_ancestors(installation)?;

    let mut plugin: Value =
        serde_json::from_str(PLUGIN).map_err(|_| "The bundled Codex plugin manifest is invalid")?;
    plugin["version"] = env!("CARGO_PKG_VERSION").into();
    let mut mcp: Value =
        serde_json::from_str(MCP).map_err(|_| "The bundled Codex MCP manifest is invalid")?;
    let server = mcp
        .pointer_mut("/mcpServers/codex-pulse")
        .and_then(Value::as_object_mut)
        .ok_or("The bundled Codex MCP server is missing")?;
    // Agent Plugins require a bare executable name or a contained ./ path.
    // A process-local PATH selects this installation without changing Windows PATH.
    server.insert("command".into(), executable_name.into());
    server.insert("args".into(), serde_json::json!(["--mcp"]));
    server.insert(
        "env".into(),
        serde_json::json!({ "PULSE_DATA_DIR": data_text, "PATH": search_path }),
    );
    let plugin_bytes = serde_json::to_vec_pretty(&plugin).map_err(|error| error.to_string())?;
    let mcp_bytes = serde_json::to_vec_pretty(&mcp).map_err(|error| error.to_string())?;

    let integrations = installation.join("integrations");
    let root = integrations.join("codex");
    let agents = root.join(".agents");
    let marketplaces = agents.join("plugins");
    let plugins = root.join("plugins");
    let pulse = plugins.join("codex-pulse");
    let assets = pulse.join("assets");
    for directory in [
        &integrations,
        &root,
        &agents,
        &marketplaces,
        &plugins,
        &pulse,
        &assets,
    ] {
        ensure_directory(directory)?;
    }
    let marketplace_path = marketplaces.join("marketplace.json");
    let outputs: [(&Path, &[u8]); 4] = [
        (&pulse.join("mcp.json"), &mcp_bytes),
        (&assets.join("icon.png"), ICON),
        (&marketplace_path, MARKETPLACE.as_bytes()),
        // Publish the version last, after all files for that version are bound.
        (&pulse.join("plugin.json"), &plugin_bytes),
    ];
    // Validate every existing output before replacing any existing file.
    for (path, _) in outputs {
        check_destination(path)?;
    }
    for (path, contents) in outputs {
        replace_file(path, contents)?;
    }
    let mut deep_link = reqwest::Url::parse("codex://plugins/codex-pulse")
        .map_err(|_| "Cannot create the Codex plugin installation link")?;
    deep_link.query_pairs_mut().append_pair(
        "marketplacePath",
        marketplace_path
            .to_str()
            .ok_or("Invalid Codex marketplace path")?,
    );
    Ok(PreparedCodexIntegration {
        marketplace_path,
        deep_link: deep_link.into(),
        opened: false,
    })
}

/// Refresh this installation's opt-in plugin files without changing host config,
/// opening Codex, or creating/reading the selected data directory.
pub fn prepare_registered_runtime(data: &Path) -> Result<PreparedCodexIntegration, String> {
    let executable = std::env::current_exe().map_err(|_| "Cannot locate the Pulse application")?;
    prepare_runtime(&executable, data)
}

fn prepare_runtime(executable: &Path, data: &Path) -> Result<PreparedCodexIntegration, String> {
    let installation = executable.parent().ok_or("Missing application directory")?;
    let manifest = installation.join("integrations/codex/plugins/codex-pulse/mcp.json");
    let existing_data = if manifest.exists() {
        check_ancestors(manifest.parent().ok_or("Missing Codex plugin directory")?)?;
        check_destination(&manifest)?;
        fs::read(&manifest)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|mcp| {
                let server = mcp.pointer("/mcpServers/codex-pulse")?;
                let command = server.get("command")?.as_str()?;
                let executable_name = executable.file_name()?.to_str()?;
                let bound = server.pointer("/env/PULSE_DATA_DIR")?.as_str()?;
                let path = PathBuf::from(bound);
                (command.eq_ignore_ascii_case(executable_name)
                    && server.get("type")?.as_str()? == "stdio"
                    && server.get("args")? == &serde_json::json!(["--mcp"])
                    && path.is_absolute()
                    && !bound.contains('\0')
                    && !bound.contains("__PULSE_"))
                .then_some(path)
            })
    } else {
        None
    };
    // Starting a second profile does not constitute consent to rebind the
    // installed plugin. Explicit CLI/settings preparation still calls prepare.
    prepare(executable, existing_data.as_deref().unwrap_or(data))
}

fn preparation_request(
    arguments: &[OsString],
    executable: &Path,
    inherited_data: Option<&OsStr>,
) -> Result<Option<(PathBuf, bool)>, String> {
    if !arguments
        .iter()
        .any(|argument| argument == "--prepare-codex-integration")
    {
        return Ok(None);
    }
    let mut explicit = None;
    let mut json = false;
    let mut index = 0;
    while index < arguments.len() {
        match arguments[index].to_str() {
            Some("--prepare-codex-integration") => (),
            Some("--json") => json = true,
            Some("--data-directory") => {
                index += 1;
                if explicit.is_some() || index >= arguments.len() {
                    return Err("Supply --data-directory once with an absolute path".into());
                }
                explicit = Some(PathBuf::from(&arguments[index]));
            }
            _ => return Err("Unsupported Codex integration preparation argument".into()),
        }
        index += 1;
    }
    let data = explicit
        .or_else(|| {
            inherited_data
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
        })
        .unwrap_or_else(|| executable.parent().unwrap_or(Path::new("")).join("data"));
    if !data.is_absolute() {
        return Err("Codex integration requires an absolute data directory".into());
    }
    Ok(Some((data, json)))
}

/// Dedicated installer/upgrade preparation. This branch runs before GUI/profile
/// initialization; normal --mcp startup is handled earlier and never writes here.
pub fn run_prepare_if_requested() -> bool {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if !arguments
        .iter()
        .any(|argument| argument == "--prepare-codex-integration")
    {
        return false;
    }
    let result = (|| {
        let executable =
            std::env::current_exe().map_err(|_| "Cannot locate the Pulse application")?;
        let inherited = std::env::var_os("PULSE_DATA_DIR");
        let (data, json) = preparation_request(&arguments, &executable, inherited.as_deref())?
            .ok_or("Missing Codex integration preparation request")?;
        let prepared = prepare(&executable, &data)?;
        if json {
            println!(
                "{}",
                serde_json::to_string(&prepared)
                    .map_err(|_| "Cannot encode prepared integration")?
            );
        } else {
            println!(
                "Codex Pulse plugin files are ready. Install link: {}",
                prepared.deep_link
            );
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        eprintln!("Codex Pulse integration preparation failed: {error}");
        std::process::exit(1);
    }
    true
}

pub(crate) fn open_installation_link(deep_link: &str) -> Result<(), String> {
    // This helper is private: callers cannot supply a scheme, tool, or arbitrary URL.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let windows = std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into());
        std::process::Command::new(Path::new(&windows).join("explorer.exe"))
            .arg(deep_link)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|_| {
                "The plugin is ready, but Windows could not open Codex. Open Codex and retry."
                    .to_string()
            })?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(deep_link)
        .spawn()
        .map_err(|_| "The plugin is ready, but Codex could not be opened".to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(deep_link)
        .spawn()
        .map_err(|_| "The plugin is ready, but Codex could not be opened".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn prepare_codex_integration(
    paths: tauri::State<'_, crate::pulse_desktop::PulsePaths>,
) -> Result<PreparedCodexIntegration, String> {
    let data = paths.data.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let executable =
            std::env::current_exe().map_err(|_| "Cannot locate the Pulse application")?;
        let mut prepared = prepare(&executable, &data)?;
        open_installation_link(&prepared.deep_link)?;
        prepared.opened = true;
        Ok(prepared)
    })
    .await
    .map_err(|_| "Codex integration preparation did not complete".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("pulse-integration-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&root).unwrap();
            Self(root)
        }

        fn executable(&self) -> PathBuf {
            self.0.join("CodexPulse.exe")
        }

        fn data(&self) -> PathBuf {
            self.0.join("custom data # 中文")
        }

        fn pulse(&self) -> PathBuf {
            self.0.join("integrations/codex/plugins/codex-pulse")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn json(path: &Path) -> Value {
        serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
    }

    #[test]
    fn prepares_embedded_plugin_with_current_version_executable_and_data_home() {
        let fixture = Fixture::new();
        let sentinel = fixture.0.join("unrelated-config.toml");
        fs::write(&sentinel, b"preserve all user settings").unwrap();
        let result = prepare(&fixture.executable(), &fixture.data()).unwrap();
        assert!(!result.opened);
        assert_eq!(json(&result.marketplace_path)["name"], "codex-pulse-local");
        let plugin = json(&fixture.pulse().join("plugin.json"));
        assert_eq!(plugin["version"], env!("CARGO_PKG_VERSION"));
        let mcp = json(&fixture.pulse().join("mcp.json"));
        let server = &mcp["mcpServers"]["codex-pulse"];
        assert_eq!(server["command"], "CodexPulse.exe");
        let search_path = server["env"]["PATH"].as_str().unwrap();
        assert_eq!(
            std::env::split_paths(search_path).next(),
            Some(fixture.0.clone())
        );
        assert_eq!(server["args"], serde_json::json!(["--mcp"]));
        assert_eq!(server["cwd"], "${PLUGIN_ROOT}");
        assert_eq!(
            server["env"]["PULSE_DATA_DIR"],
            fixture.data().to_str().unwrap()
        );
        assert_eq!(
            fs::read(fixture.pulse().join("assets/icon.png")).unwrap(),
            ICON
        );
        assert_eq!(fs::read(&sentinel).unwrap(), b"preserve all user settings");
        assert!(!fixture.data().exists());
        let url = reqwest::Url::parse(&result.deep_link).unwrap();
        assert_eq!(url.scheme(), "codex");
        assert_eq!(url.host_str(), Some("plugins"));
        assert_eq!(url.path(), "/codex-pulse");
        assert_eq!(
            url.query_pairs().collect::<Vec<_>>(),
            vec![(
                "marketplacePath".into(),
                result.marketplace_path.to_string_lossy()
            )]
        );
        let files = walkdir::WalkDir::new(&fixture.0)
            .into_iter()
            .map(Result::unwrap)
            .filter(|entry| entry.file_type().is_file())
            .count();
        assert_eq!(files, 5, "Only the four plugin files may be added");
    }

    #[test]
    fn refreshes_embedded_files_without_changing_unknown_files_or_data() {
        let fixture = Fixture::new();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        let unknown = fixture.pulse().join("keep.txt");
        fs::write(&unknown, b"do not remove").unwrap();
        fs::create_dir(&fixture.data()).unwrap();
        let data_file = fixture.data().join("preferences.json");
        fs::write(&data_file, b"user preferences").unwrap();
        fs::write(fixture.pulse().join("plugin.json"), b"old version").unwrap();
        fs::write(fixture.pulse().join("mcp.json"), b"old path").unwrap();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        assert_eq!(
            json(&fixture.pulse().join("plugin.json"))["version"],
            env!("CARGO_PKG_VERSION")
        );
        assert_eq!(fs::read(unknown).unwrap(), b"do not remove");
        assert_eq!(fs::read(data_file).unwrap(), b"user preferences");
        assert!(!walkdir::WalkDir::new(&fixture.0)
            .into_iter()
            .map(Result::unwrap)
            .any(|entry| entry.file_name().to_string_lossy().ends_with(".tmp")));
    }

    #[test]
    fn repeated_startup_preparation_does_not_rewrite_bound_files() {
        let fixture = Fixture::new();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        let files: Vec<_> = walkdir::WalkDir::new(fixture.pulse())
            .into_iter()
            .map(Result::unwrap)
            .filter(|entry| entry.file_type().is_file())
            .map(|entry| {
                (
                    entry.path().to_path_buf(),
                    entry.metadata().unwrap().modified().unwrap(),
                    fs::read(entry.path()).unwrap(),
                )
            })
            .collect();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        for (path, modified, bytes) in files {
            assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
            assert_eq!(fs::read(path).unwrap(), bytes);
        }
    }

    #[test]
    fn normal_startup_preserves_an_existing_profile_but_explicit_preparation_can_rebind_it() {
        let fixture = Fixture::new();
        let profile_a = fixture.0.join("profile A");
        let profile_b = fixture.0.join("profile B");
        prepare(&fixture.executable(), &profile_a).unwrap();
        let mcp_path = fixture.pulse().join("mcp.json");
        let before = fs::read(&mcp_path).unwrap();
        let modified = fs::metadata(&mcp_path).unwrap().modified().unwrap();
        prepare_runtime(&fixture.executable(), &profile_b).unwrap();
        assert_eq!(fs::read(&mcp_path).unwrap(), before);
        assert_eq!(
            fs::metadata(&mcp_path).unwrap().modified().unwrap(),
            modified
        );
        assert_eq!(
            json(&mcp_path)["mcpServers"]["codex-pulse"]["env"]["PULSE_DATA_DIR"],
            profile_a.to_str().unwrap()
        );
        fs::write(&mcp_path, MCP).unwrap();
        prepare_runtime(&fixture.executable(), &profile_b).unwrap();
        assert_eq!(
            json(&mcp_path)["mcpServers"]["codex-pulse"]["env"]["PULSE_DATA_DIR"],
            profile_b.to_str().unwrap()
        );
        // CLI and the explicit settings action use prepare with the selected profile.
        prepare(&fixture.executable(), &profile_a).unwrap();
        let request = [
            OsString::from("--prepare-codex-integration"),
            OsString::from("--data-directory"),
            profile_b.as_os_str().to_owned(),
        ];
        let (selected, _) = preparation_request(&request, &fixture.executable(), None)
            .unwrap()
            .unwrap();
        prepare(&fixture.executable(), &selected).unwrap();
        assert_eq!(
            json(&mcp_path)["mcpServers"]["codex-pulse"]["env"]["PULSE_DATA_DIR"],
            profile_b.to_str().unwrap()
        );
        assert!(!profile_a.exists());
        assert!(!profile_b.exists());
    }

    #[test]
    fn repairs_source_templates_overwritten_after_install_and_rebinds_a_moved_home() {
        let fixture = Fixture::new();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        // Reproduce an extracted portable package overwriting prepared manifests.
        fs::write(fixture.pulse().join("mcp.json"), MCP).unwrap();
        fs::write(fixture.pulse().join("plugin.json"), PLUGIN).unwrap();
        let moved_data = fixture.0.join("moved data home");
        prepare(&fixture.executable(), &moved_data).unwrap();
        let server = json(&fixture.pulse().join("mcp.json"));
        assert_eq!(
            server["mcpServers"]["codex-pulse"]["command"],
            "CodexPulse.exe"
        );
        assert_eq!(
            server["mcpServers"]["codex-pulse"]["env"]["PULSE_DATA_DIR"],
            moved_data.to_str().unwrap()
        );
        assert!(!server.to_string().contains("__PULSE_"));
        assert_eq!(
            json(&fixture.pulse().join("plugin.json"))["version"],
            env!("CARGO_PKG_VERSION")
        );
        assert!(
            !moved_data.exists(),
            "Preparation must not initialize data or a WebView profile"
        );
    }

    #[test]
    fn refreshes_a_copied_installations_executable_search_path_without_moving_data() {
        let original = Fixture::new();
        let moved = Fixture::new();
        prepare(&original.executable(), &original.data()).unwrap();
        prepare(&moved.executable(), &original.data()).unwrap();
        // Simulate stale prepared manifests carried along with a moved app folder.
        fs::copy(
            original.pulse().join("mcp.json"),
            moved.pulse().join("mcp.json"),
        )
        .unwrap();
        prepare(&moved.executable(), &original.data()).unwrap();
        let mcp = json(&moved.pulse().join("mcp.json"));
        let server = &mcp["mcpServers"]["codex-pulse"];
        assert_eq!(
            std::env::split_paths(server["env"]["PATH"].as_str().unwrap()).next(),
            Some(moved.0.clone())
        );
        assert_eq!(
            server["env"]["PULSE_DATA_DIR"],
            original.data().to_str().unwrap()
        );
        assert!(!original.data().exists());
    }

    #[test]
    fn headless_request_uses_explicit_data_then_environment_then_portable_default() {
        let fixture = Fixture::new();
        let args = |values: &[&str]| values.iter().map(OsString::from).collect::<Vec<_>>();
        let flag = args(&["--prepare-codex-integration", "--json"]);
        let environment = fixture.0.join("environment data");
        assert_eq!(
            preparation_request(&flag, &fixture.executable(), Some(environment.as_os_str()))
                .unwrap(),
            Some((environment.clone(), true))
        );
        assert_eq!(
            preparation_request(&flag, &fixture.executable(), None).unwrap(),
            Some((fixture.0.join("data"), true))
        );
        let explicit = fixture.0.join("explicit data 中文");
        let request = vec![
            OsString::from("--prepare-codex-integration"),
            OsString::from("--data-directory"),
            explicit.as_os_str().to_owned(),
        ];
        assert_eq!(
            preparation_request(
                &request,
                &fixture.executable(),
                Some(environment.as_os_str())
            )
            .unwrap(),
            Some((explicit, false))
        );
        assert_eq!(
            preparation_request(&args(&["--hidden"]), &fixture.executable(), None).unwrap(),
            None
        );
        for invalid in [
            args(&["--prepare-codex-integration", "--data-directory"]),
            args(&[
                "--prepare-codex-integration",
                "--data-directory",
                "relative",
            ]),
            args(&["--prepare-codex-integration", "--unexpected"]),
        ] {
            assert!(preparation_request(&invalid, &fixture.executable(), None).is_err());
        }
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    #[test]
    fn refuses_relative_paths_before_creating_files() {
        let fixture = Fixture::new();
        assert!(prepare(Path::new("CodexPulse.exe"), &fixture.data()).is_err());
        assert!(prepare(&fixture.executable(), Path::new("data")).is_err());
        assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), 0);
    }

    #[test]
    fn local_search_path_preserves_inherited_entries_and_handles_an_unset_path() {
        let fixture = Fixture::new();
        let inherited_first = fixture.0.join("other programs 中文");
        let inherited_second = fixture.0.join("tools");
        let inherited = std::env::join_paths([&inherited_first, &inherited_second]).unwrap();
        let search_path = executable_search_path(&fixture.0, Some(&inherited)).unwrap();
        assert_eq!(
            std::env::split_paths(&search_path).collect::<Vec<_>>(),
            vec![fixture.0.clone(), inherited_first, inherited_second]
        );
        let search_path = executable_search_path(&fixture.0, None).unwrap();
        assert_eq!(
            std::env::split_paths(&search_path).collect::<Vec<_>>(),
            vec![fixture.0.clone()]
        );
    }

    #[cfg(windows)]
    #[test]
    fn refuses_an_application_folder_with_a_path_separator_before_writing() {
        let fixture = Fixture::new();
        let installation = fixture.0.join("app;other");
        fs::create_dir(&installation).unwrap();
        let error = prepare(&installation.join("CodexPulse.exe"), &fixture.data()).unwrap_err();
        assert!(error.contains("semicolon"));
        assert_eq!(fs::read_dir(installation).unwrap().count(), 0);
    }

    #[test]
    fn replaces_hard_link_entry_without_changing_its_other_target() {
        let fixture = Fixture::new();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        let mcp = fixture.pulse().join("mcp.json");
        let outside = fixture.0.join("outside.json");
        fs::write(&outside, b"must remain unchanged").unwrap();
        fs::remove_file(&mcp).unwrap();
        fs::hard_link(&outside, &mcp).unwrap();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        assert_eq!(fs::read(outside).unwrap(), b"must remain unchanged");
        assert_eq!(
            json(&mcp)["mcpServers"]["codex-pulse"]["args"],
            serde_json::json!(["--mcp"])
        );
    }

    #[test]
    fn preflights_unexpected_directory_before_replacing_existing_files() {
        let fixture = Fixture::new();
        prepare(&fixture.executable(), &fixture.data()).unwrap();
        let plugin = fixture.pulse().join("plugin.json");
        fs::write(&plugin, b"existing plugin stays until checks pass").unwrap();
        let mcp = fixture.pulse().join("mcp.json");
        fs::remove_file(&mcp).unwrap();
        fs::create_dir(&mcp).unwrap();
        assert!(prepare(&fixture.executable(), &fixture.data()).is_err());
        assert_eq!(
            fs::read(plugin).unwrap(),
            b"existing plugin stays until checks pass"
        );
    }

    #[test]
    fn refuses_linked_directory_without_writing_through_it() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        let linked = fixture.0.join("integrations");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside.0, &linked).unwrap();
        #[cfg(windows)]
        {
            let output = std::process::Command::new("cmd.exe")
                .args(["/d", "/c", "mklink", "/J"])
                .arg(&linked)
                .arg(&outside.0)
                .output()
                .unwrap();
            assert!(output.status.success(), "Cannot create the test junction");
        }
        assert!(prepare(&fixture.executable(), &fixture.data()).is_err());
        assert_eq!(fs::read_dir(&outside.0).unwrap().count(), 0);
        #[cfg(unix)]
        fs::remove_file(&linked).unwrap();
        #[cfg(windows)]
        fs::remove_dir(&linked).unwrap();
    }
}
