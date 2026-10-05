use crate::config::SpoofConfig;
use anyhow::Result;

#[allow(dead_code)]
pub const DRIVER_REG_PATH: &str = "System\\CurrentControlSet\\Services\\SarabGnss\\Parameters";

#[cfg(windows)]
pub fn set_driver_parameters(config: &SpoofConfig) -> Result<()> {
    use anyhow::Context;
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, REG_DWORD,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    let subkey = HSTRING::from(DRIVER_REG_PATH);
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
            return Err(anyhow::anyhow!("Failed to open/create driver registry key: {:?}", status));
        }

        let write_string_val = |hkey: HKEY, name: &str, val: &str| -> Result<()> {
            let h_name = HSTRING::from(name);
            let wide_val: Vec<u16> = val.encode_utf16().chain(std::iter::once(0)).collect();
            let slice = std::slice::from_raw_parts(
                wide_val.as_ptr() as *const u8,
                wide_val.len() * 2,
            );
            RegSetValueExW(hkey, &h_name, 0, REG_SZ, Some(slice))
                .with_context(|| format!("Failed to set registry value '{}'", name))?;
            Ok(())
        };

        write_string_val(hkey, "Latitude", &format!("{:.7}", config.lat))?;
        write_string_val(hkey, "Longitude", &format!("{:.7}", config.lon))?;
        write_string_val(hkey, "Altitude", &format!("{:.2}", config.alt))?;
        write_string_val(hkey, "Accuracy", &format!("{:.1}", config.acc))?;

        let enabled_dw: u32 = if config.enabled { 1 } else { 0 };
        let dw_bytes = enabled_dw.to_ne_bytes();
        let h_enabled = HSTRING::from("Enabled");
        RegSetValueExW(hkey, &h_enabled, 0, REG_DWORD, Some(&dw_bytes))
            .context("Failed to set 'Enabled' registry value")?;

        windows::Win32::System::Registry::RegCloseKey(hkey);
    }

    Ok(())
}

#[cfg(windows)]
pub fn set_driver_enabled(enabled: bool) -> Result<()> {
    use anyhow::Context;
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, REG_DWORD,
    };

    let subkey = HSTRING::from(DRIVER_REG_PATH);
    let mut hkey: HKEY = Default::default();

    unsafe {
        let status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, &subkey, 0, KEY_SET_VALUE, &mut hkey);
        if status.is_err() {
            return Err(anyhow::anyhow!("Driver registry key not found (is driver installed?): {:?}", status));
        }

        let enabled_dw: u32 = if enabled { 1 } else { 0 };
        let dw_bytes = enabled_dw.to_ne_bytes();
        let h_enabled = HSTRING::from("Enabled");
        RegSetValueExW(hkey, &h_enabled, 0, REG_DWORD, Some(&dw_bytes))
            .context("Failed to set 'Enabled' value")?;

        windows::Win32::System::Registry::RegCloseKey(hkey);
    }

    Ok(())
}

#[cfg(windows)]
pub fn get_driver_parameters() -> Result<SpoofConfig> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_QUERY_VALUE,
    };

    let subkey = HSTRING::from(DRIVER_REG_PATH);
    let mut hkey: HKEY = Default::default();

    unsafe {
        let status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, &subkey, 0, KEY_QUERY_VALUE, &mut hkey);
        if status.is_err() {
            return Err(anyhow::anyhow!("Driver registry key not found"));
        }

        let read_string_val = |hkey: HKEY, name: &str| -> Option<String> {
            let h_name = HSTRING::from(name);
            let mut buf = [0u16; 128];
            let mut size = (buf.len() * 2) as u32;
            let res = RegQueryValueExW(
                hkey,
                &h_name,
                None,
                None,
                Some(buf.as_mut_ptr() as *mut u8),
                Some(&mut size),
            );
            if res.is_ok() {
                let len = (size as usize) / 2;
                let trimmed_len = if len > 0 && buf[len - 1] == 0 { len - 1 } else { len };
                Some(String::from_utf16_lossy(&buf[..trimmed_len]))
            } else {
                None
            }
        };

        let lat = read_string_val(hkey, "Latitude")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(35.6997);
        let lon = read_string_val(hkey, "Longitude")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(51.3380);
        let alt = read_string_val(hkey, "Altitude")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(1200.0);
        let acc = read_string_val(hkey, "Accuracy")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(5.0);

        let mut dw_enabled: u32 = 1;
        let mut dw_size = std::mem::size_of::<u32>() as u32;
        let h_enabled = HSTRING::from("Enabled");
        let _ = RegQueryValueExW(
            hkey,
            &h_enabled,
            None,
            None,
            Some(&mut dw_enabled as *mut u32 as *mut u8),
            Some(&mut dw_size),
        );

        RegCloseKey(hkey);

        Ok(SpoofConfig {
            lat,
            lon,
            alt,
            acc,
            enabled: dw_enabled != 0,
        })
    }
}

// Fallback for non-Windows platforms (enables cross-compilation & unit tests on Linux)
#[cfg(not(windows))]
pub fn set_driver_parameters(config: &SpoofConfig) -> Result<()> {
    crate::config::save_local_config(config)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn set_driver_enabled(enabled: bool) -> Result<()> {
    let mut config = crate::config::load_local_config();
    config.enabled = enabled;
    crate::config::save_local_config(&config)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn get_driver_parameters() -> Result<SpoofConfig> {
    Ok(crate::config::load_local_config())
}
