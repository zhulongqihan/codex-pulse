//! Pulse-only signed portable updates. No upstream endpoint or installation ID.
use base64::{engine::general_purpose::STANDARD, Engine};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, path::Path, time::Duration};
use tauri::Emitter;
use crate::types::{UpdateCheckResponse, UpdateDownloadProgress, UpdateInstallResponse};

const MANIFEST_URL: &str = "https://github.com/zhulongqihan/codex-pulse/releases/latest/download/pulse-update.json";
const PUBLIC_KEY: &[u8] = include_bytes!("../update-public-key.bin");
const MAX_PACKAGE_SIZE: u64 = 250 * 1024 * 1024;
static UPDATE_STAGE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    product: String, target: String, version: String, url: String,
    sha256: String, bytes: u64, notes: String, published_at: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { payload: String, signature: String }

fn version(value: &str) -> Result<(u32, u32, u32), String> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|p| p.is_empty() || !p.bytes().all(|c| c.is_ascii_digit())) {
        return Err("Invalid stable update version".into());
    }
    Ok((parts[0].parse().map_err(|_| "Invalid version")?, parts[1].parse().map_err(|_| "Invalid version")?, parts[2].parse().map_err(|_| "Invalid version")?))
}

fn verify_envelope(bytes: &[u8], key: &[u8]) -> Result<Manifest, String> {
    if bytes.len() > 1024 * 1024 { return Err("Update manifest is too large".into()); }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| "Invalid signed update manifest")?;
    let payload = STANDARD.decode(envelope.payload).map_err(|_| "Invalid update payload")?;
    let signature = STANDARD.decode(envelope.signature).map_err(|_| "Invalid update signature")?;
    UnparsedPublicKey::new(&ED25519, key).verify(&payload, &signature).map_err(|_| "Update signature verification failed")?;
    let manifest: Manifest = serde_json::from_slice(&payload).map_err(|_| "Invalid update metadata")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.product != "codex-pulse" || manifest.target != "windows-x86_64" {
        return Err("Update belongs to a different product or platform".into());
    }
    version(&manifest.version)?;
    let expected = format!("https://github.com/zhulongqihan/codex-pulse/releases/download/v{0}/CodexPulse-{0}-windows-x64.exe", manifest.version);
    if manifest.url != expected { return Err("Update package is outside the Pulse release source".into()); }
    if manifest.sha256.len() != 64 || !manifest.sha256.bytes().all(|c| c.is_ascii_hexdigit()) || manifest.bytes == 0 || manifest.bytes > MAX_PACKAGE_SIZE {
        return Err("Invalid update package digest or size".into());
    }
    Ok(())
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder().user_agent("Codex-Pulse-Updater").timeout(Duration::from_secs(120)).connect_timeout(Duration::from_secs(12)).build().map_err(|e| e.to_string())
}

fn fetch_manifest() -> Result<(Manifest, Vec<u8>), String> {
    if std::env::var("PULSE_OFFLINE").as_deref() == Ok("1") { return Err("Updates unavailable in offline mode".into()); }
    let response = client()?.get(MANIFEST_URL).send().map_err(|e| format!("Update service unavailable: {e}"))?;
    if !response.status().is_success() { return Err(format!("Signed Pulse update manifest unavailable ({})", response.status())); }
    let mut bytes = Vec::new();
    response.take(1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    let manifest = verify_envelope(&bytes, PUBLIC_KEY)?;
    Ok((manifest, bytes))
}

pub fn check(current: &str) -> Result<UpdateCheckResponse, String> {
    let (manifest, _) = fetch_manifest()?;
    Ok(UpdateCheckResponse {
        has_update: version(&manifest.version)? > version(current)?,
        current_version: current.into(), latest_version: manifest.version.clone(),
        latest_tag: format!("v{}", manifest.version), release_name: Some(format!("Codex Pulse {}", manifest.version)),
        release_notes: Some(manifest.notes), release_url: format!("https://github.com/zhulongqihan/codex-pulse/releases/tag/v{}", manifest.version),
        etag: None, not_modified: Some(false),
    })
}

fn verify_package(path: &Path, manifest: &Manifest) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() != manifest.bytes { return Err("Update package length mismatch".into()); }
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    loop { let read = file.read(&mut buffer).map_err(|e| e.to_string())?; if read == 0 { break; } digest.update(&buffer[..read]); }
    if format!("{:x}", digest.finalize()) != manifest.sha256.to_ascii_lowercase() { return Err("Update package SHA-256 mismatch".into()); }
    Ok(())
}

pub fn stage(app: &tauri::AppHandle, data_dir: &Path) -> Result<UpdateInstallResponse, String> {
    let _guard = UPDATE_STAGE_LOCK.try_lock().map_err(|_| "An update download is already in progress")?;
    if !cfg!(all(windows, target_arch = "x86_64")) { return Err("Portable updates support Windows x64 only".into()); }
    let (manifest, signed) = fetch_manifest()?;
    if version(&manifest.version)? <= version(&app.package_info().version.to_string())? { return Err("No newer Pulse update available".into()); }
    let directory = data_dir.join("updates");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let package = directory.join("pending.exe");
    let partial = directory.join("download.partial");
    let mut response = client()?.get(&manifest.url).send().map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Update download failed ({})", response.status())); }
    let mut file = fs::File::create(&partial).map_err(|e| e.to_string())?;
    let mut downloaded = 0u64;
    let mut buffer = [0; 65536];
    loop {
        let read = response.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 { break; }
        downloaded += read as u64;
        if downloaded > manifest.bytes { return Err("Update exceeds signed size".into()); }
        file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        let _ = app.emit("update-download-progress", UpdateDownloadProgress { downloaded, total: Some(manifest.bytes), finished: false });
    }
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    verify_package(&partial, &manifest)?;
    // Only verified bytes and their signed metadata can become a pending update.
    fs::copy(&partial, &package).map_err(|e| e.to_string())?;
    fs::write(directory.join("pending.json"), signed).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(partial);
    let _ = app.emit("update-download-progress", UpdateDownloadProgress { downloaded, total: Some(downloaded), finished: true });
    Ok(UpdateInstallResponse { version: manifest.version })
}

pub fn restart_if_staged(app: &tauri::AppHandle, data_dir: &Path) -> Result<bool, String> {
    let directory = data_dir.join("updates");
    let receipt = directory.join("pending.json");
    if !receipt.is_file() { return Ok(false); }
    let manifest = verify_envelope(&fs::read(&receipt).map_err(|e| e.to_string())?, PUBLIC_KEY)?;
    if version(&manifest.version)? <= version(&app.package_info().version.to_string())? { return Ok(false); }
    let package = directory.join("pending.exe");
    verify_package(&package, &manifest)?;
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let helper = directory.join("apply-update.ps1");
    let config = directory.join("apply-update.json");
    let health = directory.join("healthy");
    if health.is_file() { fs::remove_file(&health).map_err(|e| e.to_string())?; }
    fs::write(&helper, include_str!("apply-update.ps1")).map_err(|e| e.to_string())?;
    fs::write(&config, serde_json::to_vec(&serde_json::json!({
        "processId": std::process::id(), "executable": executable, "package": package,
        "dataDir": data_dir, "health": health, "version": manifest.version, "sha256": manifest.sha256,
    })).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let powershell = std::path::PathBuf::from(std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into()))
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        std::process::Command::new(powershell).args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(helper).arg("-ConfigPath").arg(config).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
        app.exit(0);
        return Ok(true);
    }
    #[cfg(not(windows))] { Err("Portable updates support Windows only".into()) }
}

pub fn confirm_startup(data_dir: &Path) {
    let directory = data_dir.join("updates");
    if directory.join("pending.json").is_file() {
        let _ = fs::write(directory.join("healthy"), env!("CARGO_PKG_VERSION"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::{rand::SystemRandom, signature::{Ed25519KeyPair, KeyPair}};
    fn sample() -> Manifest { Manifest { product: "codex-pulse".into(), target: "windows-x86_64".into(), version: "0.4.0".into(), url: "https://github.com/zhulongqihan/codex-pulse/releases/download/v0.4.0/CodexPulse-0.4.0-windows-x64.exe".into(), sha256: format!("{:x}", Sha256::digest(b"fixture")), bytes: 7, notes: "Fixture".into(), published_at: "2026-11-06T00:00:00Z".into() } }
    fn signed(manifest: &Manifest, key: &Ed25519KeyPair) -> Vec<u8> { let payload = serde_json::to_vec(manifest).unwrap(); serde_json::to_vec(&Envelope { signature: STANDARD.encode(key.sign(&payload)), payload: STANDARD.encode(payload) }).unwrap() }
    #[test] fn rejects_signature_brand_platform_source_and_tampering() {
        let key = Ed25519KeyPair::from_pkcs8(Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap().as_ref()).unwrap();
        let valid = signed(&sample(), &key);
        assert!(verify_envelope(&valid, key.public_key().as_ref()).is_ok());
        assert!(verify_envelope(&valid, &[0u8;32]).is_err());
        let mut envelope: Envelope = serde_json::from_slice(&valid).unwrap(); envelope.payload = STANDARD.encode(b"tampered");
        assert!(verify_envelope(&serde_json::to_vec(&envelope).unwrap(), key.public_key().as_ref()).is_err());
        for field in ["product", "target", "url"] { let mut m = sample(); match field { "product" => m.product = "upstream".into(), "target" => m.target = "linux-x86_64".into(), _ => m.url = "https://example.com/malware.exe".into() }; assert!(verify_envelope(&signed(&m,&key),key.public_key().as_ref()).is_err()); }
    }
    #[test] fn verifies_bytes_and_rejects_wrong_digest_and_size() {
        let path = std::env::temp_dir().join(format!("pulse-update-test-{}",uuid::Uuid::new_v4()));
        fs::write(&path,b"fixture").unwrap(); assert!(verify_package(&path,&sample()).is_ok());
        fs::write(&path,b"changed").unwrap(); assert!(verify_package(&path,&sample()).is_err());
        fs::write(&path,b"longer fixture").unwrap(); assert!(verify_package(&path,&sample()).is_err()); fs::remove_file(path).unwrap();
    }
    #[test] fn stable_versions_are_ordered_and_prerelease_paths_rejected() { assert!(version("0.10.0").unwrap()>version("0.9.9").unwrap()); for v in ["../x", "0.4.0-beta", "0.4", "0.4.0/evil"] { assert!(version(v).is_err()); } }
}
