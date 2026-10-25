use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpoofConfig {
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub acc: f64,
    pub enabled: bool,
    #[serde(default = "default_drift_enabled")]
    pub drift_enabled: bool,
    #[serde(default = "default_drift_radius")]
    pub drift_radius: f64,
}

fn default_drift_enabled() -> bool {
    true
}

fn default_drift_radius() -> f64 {
    1.2
}

impl Default for SpoofConfig {
    fn default() -> Self {
        Self {
            lat: 35.6997,
            lon: 51.3380,
            alt: 1200.0,
            acc: 5.0,
            enabled: true,
            drift_enabled: true,
            drift_radius: 1.2,
        }
    }
}

pub fn validate_coordinates(lat: f64, lon: f64, _alt: f64, acc: f64) -> Result<()> {
    if !(-90.0..=90.0).contains(&lat) {
        bail!("Invalid latitude: {} (must be between -90.0 and 90.0)", lat);
    }
    if !(-180.0..=180.0).contains(&lon) {
        bail!(
            "Invalid longitude: {} (must be between -180.0 and 180.0)",
            lon
        );
    }
    if acc <= 0.0 {
        bail!(
            "Invalid accuracy: {} (must be greater than 0.0 meters)",
            acc
        );
    }
    Ok(())
}

pub fn validate_drift(radius: f64) -> Result<()> {
    if !(0.0..=50.0).contains(&radius) {
        bail!(
            "Invalid drift radius: {} m (must be between 0.0 and 50.0 meters)",
            radius
        );
    }
    Ok(())
}

pub fn get_sarab_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            return PathBuf::from(program_data).join("Sarab");
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Sarab")
    } else {
        std::env::temp_dir().join("Sarab")
    }
}

pub fn get_config_path() -> PathBuf {
    get_sarab_dir().join("config.toml")
}

pub fn get_session_token_path() -> PathBuf {
    get_sarab_dir().join(".session_token")
}

pub fn get_active_port_path() -> PathBuf {
    get_sarab_dir().join(".port")
}

pub fn get_active_port() -> u16 {
    if let Ok(content) = fs::read_to_string(get_active_port_path()) {
        if let Ok(port) = content.trim().parse::<u16>() {
            return port;
        }
    }
    8090
}

#[cfg(windows)]
fn is_reparse_point(path: &std::path::Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        (meta.file_attributes() & 0x400) != 0
    } else {
        false
    }
}

#[cfg(not(windows))]
fn is_reparse_point(path: &std::path::Path) -> bool {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        meta.file_type().is_symlink()
    } else {
        false
    }
}

pub fn ensure_secure_data_dir() -> Result<PathBuf> {
    let dir = get_sarab_dir();
    if is_reparse_point(&dir) {
        anyhow::bail!(
            "Refusing to operate on reparse point / symlink directory: {:?}",
            dir
        );
    }
    fs::create_dir_all(&dir)?;

    #[cfg(windows)]
    {
        // Harden directory permissions unconditionally (SYSTEM: Full, Administrators: Full, Authenticated Users: Read/Execute)
        // This ensures directory permissions are fixed even when upgrading from older versions.
        let mut cmd = std::process::Command::new("icacls");
        cmd.args([
            dir.to_str().unwrap_or_default(),
            "/inheritance:d",
            "/grant:r",
            "*S-1-5-18:(OI)(CI)F",
            "/grant:r",
            "*S-1-5-32-544:(OI)(CI)F",
            "/grant:r",
            "*S-1-5-11:(OI)(CI)RX",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.output();
    }

    if is_reparse_point(&dir) {
        anyhow::bail!(
            "Directory became a reparse point / symlink during security configuration: {:?}",
            dir
        );
    }

    Ok(dir)
}

pub fn save_active_port(port: u16) -> Result<()> {
    let _dir = ensure_secure_data_dir()?;
    let path = get_active_port_path();
    if is_reparse_point(&path) {
        anyhow::bail!("Refusing to write to reparse point / symlink: {:?}", path);
    }
    fs::write(&path, port.to_string())?;

    #[cfg(windows)]
    {
        // Set ACL on .port: Full control for SYSTEM & Admins, Read for Authenticated Users
        let mut cmd = std::process::Command::new("icacls");
        cmd.args([
            path.to_str().unwrap_or_default(),
            "/inheritance:r",
            "/grant:r",
            "*S-1-5-18:F",
            "/grant:r",
            "*S-1-5-32-544:F",
            "/grant:r",
            "*S-1-5-11:R",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.output();
    }

    Ok(())
}

pub fn save_session_token(token: &str) -> Result<()> {
    let _dir = ensure_secure_data_dir()?;
    let path = get_session_token_path();
    if is_reparse_point(&path) {
        anyhow::bail!("Refusing to write to reparse point / symlink: {:?}", path);
    }

    // Pre-create empty file to establish DACL before writing sensitive token (zero-exposure window)
    fs::write(&path, "")?;

    #[cfg(windows)]
    {
        // Restrict token file ACL strictly to SYSTEM (S-1-5-18) & Administrators (S-1-5-32-544):
        // Inheritance removed, ordinary users have NO access.
        let mut cmd = std::process::Command::new("icacls");
        cmd.args([
            path.to_str().unwrap_or_default(),
            "/inheritance:r",
            "/grant:r",
            "*S-1-5-18:F",
            "/grant:r",
            "*S-1-5-32-544:F",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.output();
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    if is_reparse_point(&path) {
        anyhow::bail!(
            "Token file became a reparse point / symlink during ACL application: {:?}",
            path
        );
    }

    // Safely write the actual token content once permissions are fully restricted
    fs::write(&path, token)?;

    Ok(())
}

pub fn save_local_config(config: &SpoofConfig) -> Result<()> {
    let _dir = ensure_secure_data_dir()?;
    let path = get_config_path();
    if is_reparse_point(&path) {
        anyhow::bail!(
            "Refusing to write config to reparse point / symlink: {:?}",
            path
        );
    }
    let data =
        toml::to_string_pretty(config).context("Failed to serialize configuration to TOML")?;
    fs::write(&path, data)
        .with_context(|| format!("Failed to write configuration file to {:?}", path))?;

    #[cfg(windows)]
    {
        // Set ACL on config.toml: Full control for SYSTEM & Admins, Read for Authenticated Users
        let mut cmd = std::process::Command::new("icacls");
        cmd.args([
            path.to_str().unwrap_or_default(),
            "/inheritance:r",
            "/grant:r",
            "*S-1-5-18:F",
            "/grant:r",
            "*S-1-5-32-544:F",
            "/grant:r",
            "*S-1-5-11:R",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.output();
    }

    Ok(())
}

#[allow(dead_code)]
pub fn load_local_config() -> SpoofConfig {
    let path = get_config_path();
    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(config) = toml::from_str::<SpoofConfig>(&data) {
            return config;
        }
    }
    SpoofConfig::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_coordinates() {
        assert!(validate_coordinates(35.6997, 51.3380, 1200.0, 5.0).is_ok());
        assert!(validate_coordinates(-90.0, -180.0, 0.0, 0.1).is_ok());
        assert!(validate_coordinates(90.0, 180.0, 8848.0, 100.0).is_ok());
    }

    #[test]
    fn test_invalid_latitude() {
        assert!(validate_coordinates(90.0001, 50.0, 0.0, 5.0).is_err());
        assert!(validate_coordinates(-90.0001, 50.0, 0.0, 5.0).is_err());
    }

    #[test]
    fn test_invalid_longitude() {
        assert!(validate_coordinates(35.0, 180.0001, 0.0, 5.0).is_err());
        assert!(validate_coordinates(35.0, -180.0001, 0.0, 5.0).is_err());
    }

    #[test]
    fn test_invalid_accuracy() {
        assert!(validate_coordinates(35.0, 50.0, 0.0, 0.0).is_err());
        assert!(validate_coordinates(35.0, 50.0, 0.0, -5.0).is_err());
    }

    #[test]
    fn test_valid_drift() {
        assert!(validate_drift(0.0).is_ok());
        assert!(validate_drift(1.2).is_ok());
        assert!(validate_drift(50.0).is_ok());
        assert!(validate_drift(-0.1).is_err());
        assert!(validate_drift(50.1).is_err());
    }

    #[test]
    fn test_toml_serialization() {
        let original = SpoofConfig {
            lat: 40.7128,
            lon: -74.0060,
            alt: 10.0,
            acc: 3.5,
            enabled: true,
            drift_enabled: true,
            drift_radius: 1.5,
        };
        let serialized = toml::to_string(&original).expect("SpoofConfig should serialize to TOML");
        let deserialized: SpoofConfig =
            toml::from_str(&serialized).expect("Serialized TOML should deserialize to SpoofConfig");
        assert_eq!(original, deserialized);
    }
}
