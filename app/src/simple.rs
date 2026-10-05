use anyhow::Result;

#[allow(dead_code)]
pub const LFSVC_REG_PATH: &str = "System\\CurrentControlSet\\Services\\lfsvc\\Service\\Configuration";

#[cfg(windows)]
pub fn set_simple_default_location(lat: f64, lon: f64) -> Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    println!("[*] Configuring Windows Location Service Default Location (Simple Mode)...");

    let subkey = HSTRING::from(LFSVC_REG_PATH);
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
            return Err(anyhow::anyhow!("Failed to open/create lfsvc registry key: {:?}", status));
        }

        let write_str = |hkey: HKEY, name: &str, val: &str| -> Result<()> {
            let h_name = HSTRING::from(name);
            let wide_val: Vec<u16> = val.encode_utf16().chain(std::iter::once(0)).collect();
            let slice = std::slice::from_raw_parts(
                wide_val.as_ptr() as *const u8,
                wide_val.len() * 2,
            );
            let res = RegSetValueExW(hkey, &h_name, 0, REG_SZ, Some(slice));
            if res.0 != 0 {
                return Err(anyhow::anyhow!("Failed to set '{}': error code {}", name, res.0));
            }
            Ok(())
        };

        write_str(hkey, "DefaultLatitude", &format!("{:.7}", lat))?;
        write_str(hkey, "DefaultLongitude", &format!("{:.7}", lon))?;

        let _ = RegCloseKey(hkey);
    }

    println!("[+] Default location written to lfsvc registry.");
    println!("[*] Restarting Windows Location Service (lfsvc)...");

    let _ = std::process::Command::new("net").args(["stop", "lfsvc", "/y"]).output();
    let _ = std::process::Command::new("net").args(["start", "lfsvc"]).output();

    println!("[+] Simple mode applied. Windows will use these coordinates when no physical GPS or Wi-Fi location is present.");
    Ok(())
}

#[cfg(not(windows))]
pub fn set_simple_default_location(lat: f64, lon: f64) -> Result<()> {
    println!("[*] Simulated Simple Mode Default Location: Lat={:.7}, Lon={:.7}", lat, lon);
    Ok(())
}
