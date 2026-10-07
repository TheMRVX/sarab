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
                    return (
                        false,
                        "Denied (System Master Switch in Settings is OFF)".to_string(),
                    );
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
                    return (
                        false,
                        "Denied (User Location Access in Settings is OFF)".to_string(),
                    );
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LiveLocationReport {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: f64,
    pub accuracy: f64,
    pub source: String,
    pub timestamp: String,
}

#[cfg(windows)]
pub fn query_live_location() -> Result<LiveLocationReport> {
    use std::thread;
    use std::time::Duration;
    use windows::Devices::Geolocation::{Geolocator, PositionAccuracy, PositionSource, PositionStatus};

    // 1. Check Windows Privacy Consent first
    let (privacy_ok, privacy_reason) = check_location_privacy_consent();
    if !privacy_ok {
        eprintln!(
            "\n[!] WARNING: Windows Location Services are currently DISABLED in Privacy Settings!\n    Status: {}",
            privacy_reason
        );
    }

    let geolocator = Geolocator::new()
        .map_err(|e| anyhow::anyhow!("Failed to instantiate Geolocator: {:?}", e))?;

    if let Err(e) = geolocator.SetDesiredAccuracy(PositionAccuracy::High) {
        eprintln!("[!] Warning: Could not set PositionAccuracy::High: {:?}", e);
    }

    let mut status = geolocator
        .LocationStatus()
        .map_err(|e| anyhow::anyhow!("Failed to query LocationStatus: {:?}", e))?;

    if status == PositionStatus::Disabled {
        return Err(anyhow::anyhow!(
            "Windows Location Services are disabled in Windows Settings.\n\
             Please enable 'Location services' and 'Let desktop apps access your location' in Settings -> Privacy & Security -> Location."
        ));
    }

    let mut attempts = 0;
    let max_attempts = 5;
    while (status == PositionStatus::Initializing || status == PositionStatus::NoData)
        && attempts < max_attempts
    {
        attempts += 1;
        thread::sleep(Duration::from_millis(1000));
        status = geolocator
            .LocationStatus()
            .unwrap_or(PositionStatus::NotAvailable);
    }

    let max_age = windows::Foundation::TimeSpan { Duration: 0 };
    let timeout = windows::Foundation::TimeSpan {
        Duration: 150_000_000,
    };

    let async_op = geolocator
        .GetGeopositionAsyncWithAgeAndTimeout(max_age, timeout)
        .or_else(|_| geolocator.GetGeopositionAsync())
        .map_err(|e| anyhow::anyhow!(
            "GetGeopositionAsync failed (ensure Virtual GNSS driver is active and Location Services are ON): {:?}",
            e
        ))?;

    let position = async_op.get().map_err(|e| {
        anyhow::anyhow!(
            "Failed to retrieve Geoposition from Windows Location: {:?}",
            e
        )
    })?;

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

    Ok(LiveLocationReport {
        latitude: pos.Latitude,
        longitude: pos.Longitude,
        altitude: pos.Altitude,
        accuracy,
        source: source_str.to_string(),
        timestamp: "Active".to_string(),
    })
}

#[cfg(windows)]
pub fn read_windows_location() -> Result<()> {
    println!("[*] Querying Windows Location Service (Windows.Devices.Geolocation)...");
    let report = query_live_location()?;

    println!("\n=== Windows Live Location Report ===");
    println!("Latitude:   {:.7}°", report.latitude);
    println!("Longitude:  {:.7}°", report.longitude);
    println!("Altitude:   {:.2} m", report.altitude);
    println!("Accuracy:   {:.1} m", report.accuracy);
    println!("Source:     {}", report.source);
    println!("====================================\n");

    Ok(())
}

#[cfg(not(windows))]
pub fn query_live_location() -> Result<LiveLocationReport> {
    let cfg = crate::driver_comm::get_driver_parameters().unwrap_or_default();
    Ok(LiveLocationReport {
        latitude: cfg.lat,
        longitude: cfg.lon,
        altitude: cfg.alt,
        accuracy: cfg.acc,
        source: "Satellite (GNSS / GPS)".to_string(),
        timestamp: "Simulated Fix".to_string(),
    })
}

#[cfg(not(windows))]
pub fn read_windows_location() -> Result<()> {
    let report = query_live_location()?;
    println!(
        "[*] Simulated Location: Lat: {:.7}°, Lon: {:.7}°, Alt: {:.2} m, Acc: {:.1} m (Source: {})",
        report.latitude, report.longitude, report.altitude, report.accuracy, report.source
    );
    Ok(())
}
