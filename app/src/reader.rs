use anyhow::Result;

#[cfg(windows)]
pub fn check_location_privacy_consent() -> (bool, String) {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
        KEY_READ,
    };

    let subkey = HSTRING::from(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location",
    );
    let val_name = HSTRING::from("Value");

    unsafe {
        // Check HKLM (System-wide setting)
        let mut hkey: HKEY = Default::default();
        if RegOpenKeyExW(HKEY_LOCAL_MACHINE, &subkey, 0, KEY_READ, &mut hkey).is_ok() {
            let mut buf = [0u16; 64];
            let mut size = (buf.len() * 2) as u32;
            if RegQueryValueExW(
                hkey,
                &val_name,
                None,
                None,
                Some(buf.as_mut_ptr() as *mut u8),
                Some(&mut size),
            )
            .is_ok()
            {
                let len = (size as usize) / 2;
                let val_str = String::from_utf16_lossy(&buf[..len])
                    .trim_matches('\0')
                    .to_string();
                let _ = RegCloseKey(hkey);
                if val_str.eq_ignore_ascii_case("Deny") {
                    return (false, "Denied (System Master Switch in Settings is OFF)".to_string());
                }
            } else {
                let _ = RegCloseKey(hkey);
            }
        }

        // Check HKCU (Per-user setting)
        let mut hkey_user: HKEY = Default::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, &subkey, 0, KEY_READ, &mut hkey_user).is_ok() {
            let mut buf = [0u16; 64];
            let mut size = (buf.len() * 2) as u32;
            if RegQueryValueExW(
                hkey_user,
                &val_name,
                None,
                None,
                Some(buf.as_mut_ptr() as *mut u8),
                Some(&mut size),
            )
            .is_ok()
            {
                let len = (size as usize) / 2;
                let val_str = String::from_utf16_lossy(&buf[..len])
                    .trim_matches('\0')
                    .to_string();
                let _ = RegCloseKey(hkey_user);
                if val_str.eq_ignore_ascii_case("Deny") {
                    return (false, "Denied (User Location Access in Settings is OFF)".to_string());
                }
            } else {
                let _ = RegCloseKey(hkey_user);
            }
        }
    }

    (true, "Allowed".to_string())
}

#[cfg(not(windows))]
pub fn check_location_privacy_consent() -> (bool, String) {
    (true, "Allowed (Simulated)".to_string())
}

#[cfg(windows)]
pub fn read_windows_location() -> Result<()> {
    use std::thread;
    use std::time::Duration;
    use windows::Devices::Geolocation::{Geolocator, PositionStatus};

    println!("[*] Querying Windows Location Service (Windows.Devices.Geolocation)...");

    // 1. Check Windows Privacy Consent first
    let (privacy_ok, privacy_reason) = check_location_privacy_consent();
    if !privacy_ok {
        println!("\n[!] WARNING: Windows Location Services are currently DISABLED in Privacy Settings!");
        println!("    Status: {}", privacy_reason);
        println!("    To enable:");
        println!("    1. Open Windows Settings (Win + I) -> Privacy & Security -> Location.");
        println!("    2. Turn ON 'Location services'.");
        println!("    3. Turn ON 'Let desktop apps access your location'.\n");
    }

    let geolocator = Geolocator::new()
        .map_err(|e| anyhow::anyhow!("Failed to instantiate Geolocator: {:?}", e))?;

    // Force GNSS hardware engine activation instead of IP/Wi-Fi fallback
    use windows::Devices::Geolocation::{PositionAccuracy, PositionSource};
    if let Err(e) = geolocator.SetDesiredAccuracy(PositionAccuracy::High) {
        eprintln!("[!] Warning: Could not set PositionAccuracy::High: {:?}", e);
    }

    let mut status = geolocator
        .LocationStatus()
        .map_err(|e| anyhow::anyhow!("Failed to query LocationStatus: {:?}", e))?;

    println!("[*] Initial Location Status: {:?}", status);

    if status == PositionStatus::Disabled {
        return Err(anyhow::anyhow!(
            "Windows Location Services are disabled in Windows Settings.\n\
             Please enable 'Location services' and 'Let desktop apps access your location' in Settings -> Privacy & Security -> Location."
        ));
    }

    // 2. Retry loop for warming up driver/service if Initializing or NoData
    let mut attempts = 0;
    let max_attempts = 5;
    while (status == PositionStatus::Initializing || status == PositionStatus::NoData) && attempts < max_attempts {
        attempts += 1;
        println!(
            "[*] Sensor pipeline initializing... waiting for GPS fix (attempt {}/{})...",
            attempts, max_attempts
        );
        thread::sleep(Duration::from_millis(1000));
        status = geolocator.LocationStatus().unwrap_or(PositionStatus::NotAvailable);
    }

    println!("[*] Active Location Status: {:?}", status);

    // Request fresh fix with zero max-age (bypass stale IP cache) and 15s timeout
    let max_age = windows::Foundation::TimeSpan { Duration: 0 };
    let timeout = windows::Foundation::TimeSpan { Duration: 150_000_000 };

    let async_op = geolocator
        .GetGeopositionAsyncWithAgeAndTimeout(max_age, timeout)
        .or_else(|_| geolocator.GetGeopositionAsync())
        .map_err(|e| anyhow::anyhow!(
            "GetGeopositionAsync failed (ensure Virtual GNSS driver is active and Location Services are ON): {:?}",
            e
        ))?;

    let position = async_op
        .get()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Geoposition from Windows Location: {:?}", e))?;

    let coordinate = position
        .Coordinate()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Coordinate: {:?}", e))?;

    let point = coordinate
        .Point()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve Point: {:?}", e))?;

    let pos = point
        .Position()
        .map_err(|e| anyhow::anyhow!("Failed to retrieve BasicGeoposition: {:?}", e))?;

    let accuracy = coordinate.Accuracy().unwrap_or(0.0);
    let source_str = match coordinate.PositionSource() {
        Ok(PositionSource(0)) => "Cellular",
        Ok(PositionSource(1)) => "Satellite (GNSS / GPS)",
        Ok(PositionSource(2)) => "WiFi",
        Ok(PositionSource(3)) => "IPAddress",
        Ok(PositionSource(4)) => "Unknown",
        Ok(PositionSource(5)) => "Default",
        Ok(PositionSource(6)) => "Obfuscated",
        _ => "Unspecified",
    };

    println!("\n=== Windows Live Location Report ===");
    println!("Latitude:   {:.7}°", pos.Latitude);
    println!("Longitude:  {:.7}°", pos.Longitude);
    println!("Altitude:   {:.2} m", pos.Altitude);
    println!("Accuracy:   {:.1} m", accuracy);
    println!("Source:     {}", source_str);
    println!("====================================\n");

    Ok(())
}

#[cfg(not(windows))]
pub fn read_windows_location() -> Result<()> {
    println!("[*] Simulated Location: Lat: 35.6997000°, Lon: 51.3380000°, Alt: 1200.00 m, Acc: 5.0 m");
    Ok(())
}
