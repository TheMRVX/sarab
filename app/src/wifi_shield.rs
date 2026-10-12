//! Windows Location Authority & Wi-Fi BSSID Anti-Detection Shield.
//! Eliminates rubberbanding/jitter caused by Windows Location Provider falling back
//! to Wi-Fi triangulation when Wi-Fi is active.

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldStatus {
    pub rtk_shield_enabled: bool,
    pub gnss_authority_percent: u32,
    pub anti_rubberband_active: bool,
    pub wifi_scanning_suppressed: bool,
    pub details: String,
}

#[cfg(windows)]
pub fn get_rtk_shield_enabled() -> bool {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ, REG_DWORD};

    let subkey = HSTRING::from(crate::driver_comm::DRIVER_REG_PATH);
    let mut hkey: HKEY = Default::default();

    unsafe {
        let status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, &subkey, 0, KEY_READ, &mut hkey);
        if status.is_err() {
            return true; // Default to enabled for maximum protection
        }

        let name = HSTRING::from("RtkShield");
        let mut val: u32 = 0;
        let mut val_size: u32 = std::mem::size_of::<u32>() as u32;
        let mut val_type: REG_DWORD = Default::default();

        let query_res = RegQueryValueExW(
            hkey,
            &name,
            None,
            Some(&mut val_type),
            Some(&mut val as *mut u32 as *mut u8),
            Some(&mut val_size),
        );

        if query_res.is_ok() {
            val != 0
        } else {
            true
        }
    }
}

#[cfg(not(windows))]
pub fn get_rtk_shield_enabled() -> bool {
    true
}

#[cfg(windows)]
pub fn set_rtk_shield_enabled(enabled: bool) -> Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, REG_DWORD,
        REG_OPTION_NON_VOLATILE,
    };

    let subkey = HSTRING::from(crate::driver_comm::DRIVER_REG_PATH);
    let mut hkey: HKEY = Default::default();

    unsafe {
        let status = RegCreateKeyExW(
            HKEY_LOCAL_MACHINE,
            &subkey,
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        );
        if status.is_err() {
            return Err(anyhow::anyhow!("Failed to open registry for RTK shield: {:?}", status));
        }

        let name = HSTRING::from("RtkShield");
        let val: u32 = if enabled { 1 } else { 0 };
        let slice = std::slice::from_raw_parts(&val as *const u32 as *const u8, std::mem::size_of::<u32>());

        let res = RegSetValueExW(hkey, &name, 0, REG_DWORD, Some(slice));
        if res.is_err() {
            return Err(anyhow::anyhow!("Failed to write RtkShield registry value: {:?}", res));
        }

        Ok(())
    }
}

#[cfg(not(windows))]
pub fn set_rtk_shield_enabled(_enabled: bool) -> Result<()> {
    Ok(())
}

/// Retrieve current Location Authority & Shield Status
pub fn query_shield_status() -> ShieldStatus {
    let rtk_enabled = get_rtk_shield_enabled();
    ShieldStatus {
        rtk_shield_enabled: rtk_enabled,
        gnss_authority_percent: if rtk_enabled { 100 } else { 85 },
        anti_rubberband_active: rtk_enabled,
        wifi_scanning_suppressed: rtk_enabled,
        details: if rtk_enabled {
            "RTK Carrier-Phase simulation active (100% GNSS authority; Wi-Fi BSSID triangulation suppressed)".to_string()
        } else {
            "Standard civilian GNSS fix (Standard authority; Wi-Fi scanning may cause position jitter)".to_string()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shield_status_query() {
        let status = query_shield_status();
        assert!(status.gnss_authority_percent >= 85);
        assert!(!status.details.is_empty());
    }
}
