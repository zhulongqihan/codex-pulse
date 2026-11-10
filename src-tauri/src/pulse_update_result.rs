//! Bounded, read-only interpretation of the existing portable helper receipt.
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path, time::UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecoveryResult {
    pub id: String,
    pub status: String,
    pub reason: String,
    pub attempted_version: Option<String>,
    pub recorded_at: Option<String>,
}

fn bounded(path: &Path) -> Option<(Vec<u8>, fs::Metadata)> {
    if fs::symlink_metadata(path).ok()?.file_type().is_symlink() {
        return None;
    }
    let mut file = fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > 8192 {
        return None;
    }
    let mut bytes = Vec::new();
    file.by_ref().take(8193).read_to_end(&mut bytes).ok()?;
    (bytes.len() <= 8192).then_some((bytes, metadata))
}

fn digest_file(path: &Path) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    if file.metadata().ok()?.len() > 250 * 1024 * 1024 {
        return None;
    }
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Some(digest.finalize().to_vec())
}

pub fn read(data: &Path, executable: &Path) -> Option<UpdateRecoveryResult> {
    let directory = data.join("updates");
    // The restarted new app can be alive before its helper has written a result.
    // An older failed attempt must not be shown during this two-phase handshake.
    if directory.join("pending.json").exists() {
        return None;
    }
    let (bytes, metadata) = bounded(&directory.join("result.txt"))?;
    let text = String::from_utf8_lossy(&bytes);
    let reason = text
        .trim_start_matches('\u{feff}')
        .trim()
        .strip_prefix("Update failed: ")?
        .strip_suffix(". Previous executable restored; user data preserved.")?;
    if reason.trim().is_empty() {
        return None;
    }
    let (failed, failed_metadata) = bounded(&directory.join("pending.failed.json"))?;
    if !serde_json::from_slice::<Value>(&failed).ok()?.is_object() {
        return None;
    }
    let modified = metadata.modified().ok()?;
    if failed_metadata.modified().ok()? > modified {
        return None;
    }
    let mut digest = Sha256::new();
    digest.update(&bytes);
    digest.update(&failed);
    let elapsed = modified.duration_since(UNIX_EPOCH).ok()?;
    digest.update(elapsed.as_nanos().to_le_bytes());
    let id = format!("{:x}", digest.finalize());
    if let Some((ack, _)) = bounded(&directory.join("result-ack.json")) {
        if serde_json::from_slice::<Value>(&ack)
            .ok()
            .and_then(|value| value["id"].as_str().map(str::to_owned))
            .as_deref()
            == Some(&id)
        {
            return None;
        }
    }
    let attempted_version =
        bounded(&directory.join("apply-update.json")).and_then(|(config, _)| {
            let config: Value = serde_json::from_slice(&config).ok()?;
            if Path::new(config["dataDir"].as_str()?).canonicalize().ok()?
                != data.canonicalize().ok()?
                || Path::new(config["executable"].as_str()?)
                    .canonicalize()
                    .ok()?
                    != executable.canonicalize().ok()?
            {
                return None;
            }
            let version = config["version"].as_str()?;
            let parts: Vec<_> = version.split('.').collect();
            (parts.len() == 3
                && parts
                    .iter()
                    .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())))
            .then(|| version.to_owned())
        });
    let backup = executable.with_file_name(format!(
        "{}.previous",
        executable.file_name()?.to_string_lossy()
    ));
    let restored = digest_file(&backup)
        .zip(digest_file(executable))
        .is_some_and(|(backup, current)| backup == current);
    Some(UpdateRecoveryResult {
        id,
        status: if restored { "restored" } else { "incomplete" }.into(),
        reason: if std::str::from_utf8(&bytes).is_err() {
            "The legacy update receipt uses an unsupported text encoding. Open update records to inspect the original reason.".into()
        } else {
            reason
                .chars()
                .map(|ch| if ch.is_control() { ' ' } else { ch })
                .take(512)
                .collect()
        },
        attempted_version,
        recorded_at: DateTime::<Utc>::from_timestamp(
            elapsed.as_secs() as i64,
            elapsed.subsec_nanos(),
        )
        .map(|date| date.to_rfc3339()),
    })
}

pub fn fetch(data: &Path, executable: &Path) -> Result<Option<UpdateRecoveryResult>, String> {
    if data.join("updates/pending.json").exists() {
        return Ok(None);
    }
    match fs::File::open(data.join("updates/result.txt")) {
        Ok(file) => {
            if file.metadata().map_err(|error| error.to_string())?.len() > 8192 {
                return Err("The update result exceeds the supported size; open update records to inspect it.".into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read the update result: {error}")),
    }
    Ok(read(data, executable))
}

pub fn dismiss(data: &Path, executable: &Path, id: &str) -> Result<(), String> {
    if id.len() != 64 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid update result ID".into());
    }
    let Some(result) = fetch(data, executable)? else {
        return Ok(());
    };
    if result.id != id {
        return Err("The update result changed; read it again before dismissing".into());
    }
    let directory = data.join("updates");
    let temporary = directory.join(format!(".result-ack-{}.tmp", uuid::Uuid::new_v4()));
    let bytes =
        serde_json::to_vec(&serde_json::json!({"id":id})).map_err(|error| error.to_string())?;
    let write = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, directory.join("result-ack.json"))
    })();
    if write.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write.map_err(|error| error.to_string())
}

/// Keep all old receipt evidence before staging the next verified attempt.
pub fn archive_previous(data: &Path) -> Result<(), String> {
    let directory = data.join("updates");
    let names = ["result.txt", "pending.failed.json", "result-ack.json"];
    if !names.iter().any(|name| directory.join(name).exists()) {
        return Ok(());
    }
    let archive = directory
        .join("history")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&archive).map_err(|error| error.to_string())?;
    for name in names {
        let source = directory.join(name);
        if source.exists() {
            fs::rename(&source, archive.join(name)).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("pulse-result-{}", uuid::Uuid::new_v4()));
        let data = root.join("data");
        fs::create_dir_all(data.join("updates")).unwrap();
        let executable = root.join("CodexPulse.exe");
        fs::write(&executable, b"synthetic old executable").unwrap();
        (data, executable)
    }
    fn failed(data: &Path, executable: &Path) {
        fs::write(data.join("updates/pending.failed.json"), b"{}").unwrap();
        fs::write(
            data.join("updates/apply-update.json"),
            serde_json::to_vec(
                &serde_json::json!({"dataDir":data,"executable":executable,"version":"0.7.2"}),
            )
            .unwrap(),
        )
        .unwrap();
        fs::write(data.join("updates/result.txt"), "Update failed: Updated app did not confirm startup. Previous executable restored; user data preserved.\r\n").unwrap();
    }
    #[test]
    fn strict_receipts_confirm_backup_only_when_bytes_match_and_acknowledge_exact_attempt() {
        let (data, executable) = fixture();
        failed(&data, &executable);
        let unconfirmed = read(&data, &executable).unwrap();
        assert_eq!(unconfirmed.status, "incomplete");
        fs::copy(
            &executable,
            executable.with_file_name("CodexPulse.exe.previous"),
        )
        .unwrap();
        let confirmed = read(&data, &executable).unwrap();
        assert_eq!(confirmed.status, "restored");
        assert_eq!(confirmed.attempted_version.as_deref(), Some("0.7.2"));
        assert_eq!(confirmed.reason, "Updated app did not confirm startup");
        assert!(confirmed.recorded_at.is_some());
        assert!(dismiss(&data, &executable, &"0".repeat(64)).is_err());
        dismiss(&data, &executable, &confirmed.id).unwrap();
        assert!(read(&data, &executable).is_none());
        assert!(data.join("updates/result.txt").is_file());
        fs::remove_dir_all(data.parent().unwrap()).unwrap();
    }
    #[test]
    fn pending_success_invalid_and_oversized_files_are_not_rollback_confirmation() {
        let (data, executable) = fixture();
        failed(&data, &executable);
        fs::write(data.join("updates/pending.json"), b"{}").unwrap();
        assert!(read(&data, &executable).is_none());
        fs::remove_file(data.join("updates/pending.json")).unwrap();
        for text in [
            "Update installed successfully",
            "restored",
            "Update failed: arbitrary",
        ] {
            fs::write(data.join("updates/result.txt"), text).unwrap();
            assert!(read(&data, &executable).is_none());
        }
        fs::write(data.join("updates/result.txt"), vec![b'x'; 8193]).unwrap();
        assert!(read(&data, &executable).is_none());
        fs::remove_dir_all(data.parent().unwrap()).unwrap();
    }
    #[test]
    fn staging_archives_receipts_and_acknowledgements_without_deleting_evidence() {
        let (data, executable) = fixture();
        failed(&data, &executable);
        let id = read(&data, &executable).unwrap().id;
        dismiss(&data, &executable, &id).unwrap();
        archive_previous(&data).unwrap();
        assert!(read(&data, &executable).is_none());
        let archive = fs::read_dir(data.join("updates/history"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        for name in ["result.txt", "pending.failed.json", "result-ack.json"] {
            assert!(archive.join(name).is_file());
        }
        fs::remove_dir_all(data.parent().unwrap()).unwrap();
    }

    #[test]
    fn windows_utf8_bom_and_legacy_ansi_keep_protocol_but_do_not_display_mojibake() {
        let (data, executable) = fixture();
        failed(&data, &executable);
        fs::write(data.join("updates/result.txt"), "\u{feff}Update failed: 合成启动失败. Previous executable restored; user data preserved.\r\n").unwrap();
        assert_eq!(read(&data, &executable).unwrap().reason, "合成启动失败");
        let mut legacy = b"Update failed: ".to_vec();
        legacy.extend_from_slice(&[0xc6, 0xf4, 0xb6, 0xaf]);
        legacy.extend_from_slice(b". Previous executable restored; user data preserved.\r\n");
        fs::write(data.join("updates/result.txt"), legacy).unwrap();
        assert!(read(&data, &executable)
            .unwrap()
            .reason
            .contains("unsupported text encoding"));
        fs::remove_dir_all(data.parent().unwrap()).unwrap();
    }

    #[test]
    #[ignore = "Run with PULSE_UPDATE_RESULT_FIXTURE_DIR after the isolated real helper failure fixtures"]
    fn reads_actual_helper_failure_receipts_with_bom_and_confirmed_previous_bytes() {
        let root = std::path::PathBuf::from(
            std::env::var_os("PULSE_UPDATE_RESULT_FIXTURE_DIR")
                .expect("isolated helper evidence directory"),
        );
        for name in ["startup-failure", "startup-failure-with-mcp-reconnect"] {
            let installation = root.join(name);
            let bytes = fs::read(installation.join("data/updates/result.txt")).unwrap();
            assert!(
                bytes.starts_with(&[0xef, 0xbb, 0xbf]),
                "Windows PowerShell UTF8 receipt must be handled with its real BOM"
            );
            let result = fetch(
                &installation.join("data"),
                &installation.join("CodexPulse.exe"),
            )
            .unwrap()
            .unwrap();
            assert_eq!(result.status, "restored");
            assert_eq!(result.attempted_version.as_deref(), Some("0.5.0"));
            assert_eq!(result.reason, "Updated app did not confirm startup");
        }
    }
}
