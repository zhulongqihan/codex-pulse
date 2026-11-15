use super::QuotaRecordingPreferences;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

pub(super) const FILE: &str = "quota-recording-preferences.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Preferences {
    pub schema_version: u8,
    pub enabled: bool,
    pub timezone: String,
    pub epoch: u64,
}
impl Preferences {
    pub fn public(&self) -> QuotaRecordingPreferences {
        QuotaRecordingPreferences {
            schema_version: self.schema_version,
            enabled: self.enabled,
            timezone: self.timezone.clone(),
        }
    }
    pub fn load(directory: &Path, timezone: &str) -> Result<Self, String> {
        let target = directory.join(FILE);
        if !target.exists() {
            let zone = timezone
                .parse::<chrono_tz::Tz>()
                .ok()
                .or_else(|| {
                    iana_time_zone::get_timezone()
                        .ok()
                        .and_then(|s| s.parse().ok())
                })
                .unwrap_or(chrono_tz::UTC);
            let preferences = Self {
                schema_version: 1,
                enabled: true,
                timezone: zone.name().into(),
                epoch: 1,
            };
            preferences.save(directory)?;
            return Ok(preferences);
        }
        let metadata = fs::symlink_metadata(&target)
            .map_err(|_| "Cannot inspect quota recording preferences")?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16 * 1024 {
            return Err("Invalid quota recording preferences file".into());
        }
        let mut bytes = vec![];
        fs::File::open(&target)
            .and_then(|f| f.take(16 * 1024 + 1).read_to_end(&mut bytes))
            .map_err(|_| "Cannot read quota recording preferences")?;
        let value: Self = serde_json::from_slice(&bytes)
            .map_err(|_| "Cannot parse quota recording preferences; original preserved")?;
        if value.schema_version != 1
            || value.epoch == 0
            || value.timezone.parse::<chrono_tz::Tz>().is_err()
        {
            return Err("Unsupported quota recording preferences; original preserved".into());
        }
        Ok(value)
    }
    pub fn save(&self, directory: &Path) -> Result<(), String> {
        let target = directory.join(FILE);
        if fs::symlink_metadata(&target).is_ok_and(|m| !m.is_file() || m.file_type().is_symlink()) {
            return Err("Quota recording preferences must be a regular file".into());
        }
        let temporary = directory.join(format!(".quota-recording-{}.tmp", uuid::Uuid::new_v4()));
        let bytes =
            serde_json::to_vec(self).map_err(|_| "Cannot encode quota recording preferences")?;
        let result = (|| -> std::io::Result<()> {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            f.write_all(&bytes)?;
            f.sync_all()?;
            drop(f);
            fs::rename(&temporary, &target)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|_| "Cannot save quota recording preferences".into())
    }
}
