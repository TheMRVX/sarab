use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpoofConfig {
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub acc: f64,
    pub enabled: bool,
}

impl Default for SpoofConfig {
    fn default() -> Self {
        Self {
            lat: 35.6997,
            lon: 51.3380,
            alt: 1200.0,
            acc: 5.0,
            enabled: true,
        }
    }
}

pub fn validate_coordinates(lat: f64, lon: f64, _alt: f64, acc: f64) -> Result<()> {
    if !(-90.0..=90.0).contains(&lat) {
        bail!("Invalid latitude: {} (must be between -90.0 and 90.0)", lat);
    }
    if !(-180.0..=180.0).contains(&lon) {
        bail!("Invalid longitude: {} (must be between -180.0 and 180.0)", lon);
    }
    if acc <= 0.0 {
        bail!("Invalid accuracy: {} (must be greater than 0.0 meters)", acc);
    }
    Ok(())
}

pub fn get_config_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Sarab").join("config.toml")
    } else {
        PathBuf::from("config.toml")
    }
}

pub fn save_local_config(config: &SpoofConfig) -> Result<()> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let data = toml::to_string_pretty(config)
        .context("Failed to serialize configuration to TOML")?;
    fs::write(&path, data)
        .with_context(|| format!("Failed to write configuration file to {:?}", path))?;
    Ok(())
}

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
    fn test_toml_serialization() {
        let original = SpoofConfig {
            lat: 40.7128,
            lon: -74.0060,
            alt: 10.0,
            acc: 3.5,
            enabled: true,
        };
        let serialized = toml::to_string(&original).unwrap();
        let deserialized: SpoofConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(original, deserialized);
    }
}
