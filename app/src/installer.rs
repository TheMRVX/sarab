use anyhow::Result;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
pub const HARDWARE_ID: &str = "Root\\SarabGnss";
#[allow(dead_code)]
pub const SENSOR_CLASS_GUID_STR: &str = "5175D334-C371-4806-B3BA-71FD53C9258D";

#[cfg(windows)]
pub const SENSOR_CLASS_GUID: windows::core::GUID = windows::core::GUID::from_values(
    0x5175D334,
    0xC371,
    0x4806,
    [0xB3, 0xBA, 0x71, 0xFD, 0x53, 0xC9, 0x25, 0x8D],
);

pub fn find_driver_files(custom_inf: Option<String>) -> Result<(PathBuf, PathBuf)> {
    let inf_path = if let Some(path_str) = custom_inf {
        PathBuf::from(path_str)
    } else {
        // Look in executable directory, current directory, or driver/
        let candidates = [
            std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("SarabGnss.inf"))),
            Some(PathBuf::from("SarabGnss.inf")),
            Some(PathBuf::from("driver").join("SarabGnss.inf")),
        ];
        candidates
            .into_iter()
            .flatten()
            .find(|p| p.exists())
            .unwrap_or_else(|| PathBuf::from("SarabGnss.inf"))
    };

    let cer_path = inf_path.with_extension("cer");
    Ok((inf_path, cer_path))
}

pub fn check_test_signing_mode() -> (bool, String) {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_QUERY_VALUE,
        };

        let subkey = HSTRING::from("System\\CurrentControlSet\\Control");
        let mut hkey: HKEY = Default::default();

        unsafe {
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, &subkey, 0, KEY_QUERY_VALUE, &mut hkey).is_ok() {
                let val_name = HSTRING::from("SystemStartOptions");
                let mut buf = [0u16; 512];
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
                    let _ = RegCloseKey(hkey);
                    let len = (size as usize) / 2;
                    let opts = String::from_utf16_lossy(&buf[..len]).to_uppercase();
                    let enabled = opts.contains("TESTSIGNING");
                    return (enabled, opts.trim().to_string());
                }
                let _ = RegCloseKey(hkey);
            }
        }
    }
    (false, "Unknown".to_string())
}

pub fn check_bitlocker_status() -> String {
    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("manage-bde")
            .args(["-status", "C:"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).to_uppercase();
            if text.contains("PROTECTION ON") {
                return "ACTIVE (Protection ON)".to_string();
            } else if text.contains("PROTECTION OFF") {
                return "SUSPENDED / OFF".to_string();
            } else if text.contains("PERCENTAGE ENCRYPTED: 0") {
                return "NOT ENCRYPTED".to_string();
            }
        }
    }
    "UNKNOWN / NOT DETECTED".to_string()
}

#[cfg(windows)]
pub fn install_certificate_to_stores(cer_path: &Path) -> Result<()> {
    use anyhow::Context;

    if !cer_path.exists() {
        return Err(anyhow::anyhow!(
            "Certificate file not found at: {:?}. Ensure driver package includes SarabGnss.cer.",
            cer_path
        ));
    }

    let cer_str = cer_path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid certificate path"))?;

    for store in ["Root", "TrustedPublisher"] {
        let output = std::process::Command::new("certutil")
            .args(["-addstore", "-f", store, cer_str])
            .output()
            .with_context(|| format!("Failed to run certutil for store {}", store))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(anyhow::anyhow!(
                "certutil failed for store {}: stdout: {}, stderr: {}",
                store,
                stdout,
                stderr
            ));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn remove_devices_by_hwid(target_hwid: &str) -> usize {
    use windows::core::GUID;
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiCallClassInstaller, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
        SetupDiGetClassDevsW, SetupDiGetDeviceRegistryPropertyW, DIF_REMOVE, DIGCF_ALLCLASSES,
        SPDRP_HARDWAREID, SP_DEVINFO_DATA,
    };

    let mut removed_count = 0;
    unsafe {
        let Ok(dev_info) = SetupDiGetClassDevsW(None, None, None, DIGCF_ALLCLASSES) else {
            return 0;
        };

        let mut dev_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ClassGuid: GUID::zeroed(),
            DevInst: 0,
            Reserved: 0,
        };

        let mut index = 0;
        while SetupDiEnumDeviceInfo(dev_info, index, &mut dev_data).is_ok() {
            let mut buf = [0u8; 512];
            let mut req_size = 0;

            let mut was_removed = false;
            if SetupDiGetDeviceRegistryPropertyW(
                dev_info,
                &mut dev_data,
                SPDRP_HARDWAREID,
                None,
                Some(&mut buf),
                Some(&mut req_size),
            )
            .is_ok()
            {
                let wide_slice: &[u16] = std::slice::from_raw_parts(
                    buf.as_ptr() as *const u16,
                    (req_size as usize) / 2,
                );
                let hwid_str = String::from_utf16_lossy(wide_slice);
                if hwid_str.to_lowercase().contains(&target_hwid.to_lowercase()) {
                    println!("[+] Removing device: {}", hwid_str.trim_matches('\0'));
                    if SetupDiCallClassInstaller(DIF_REMOVE, dev_info, Some(&mut dev_data)).is_ok() {
                        removed_count += 1;
                        was_removed = true;
                    }
                }
            }
            if !was_removed {
                index += 1;
            }
        }

        let _ = SetupDiDestroyDeviceInfoList(dev_info);
    }
    removed_count
}

#[cfg(windows)]
pub fn install_driver_device(inf_path: &Path) -> Result<()> {
    use anyhow::Context;
    use windows::core::PCWSTR;
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiCallClassInstaller, SetupDiCreateDeviceInfoList, SetupDiCreateDeviceInfoW,
        SetupDiDestroyDeviceInfoList, SetupDiSetDeviceRegistryPropertyW,
        UpdateDriverForPlugAndPlayDevicesW, DICD_GENERATE_ID, DIF_REGISTERDEVICE,
        INSTALLFLAG_FORCE, SPDRP_HARDWAREID, SP_DEVINFO_DATA,
    };
    use windows::Win32::Foundation::BOOL;

    let abs_inf = std::fs::canonicalize(inf_path)
        .with_context(|| format!("Driver INF file not found: {:?}", inf_path))?;
    let mut clean_inf = abs_inf.to_string_lossy().to_string();
    if let Some(stripped) = clean_inf.strip_prefix(r"\\?\") {
        clean_inf = stripped.to_string();
    }
    let wide_inf: Vec<u16> = clean_inf.encode_utf16().chain(std::iter::once(0)).collect();

    // 1. Stage driver package in Windows Driver Store via pnputil
    println!("[*] Staging driver package in Windows Driver Store via pnputil...");
    let pnp_output = std::process::Command::new("pnputil")
        .args(["/add-driver", &clean_inf, "/install"])
        .output();
    if let Ok(ref out) = pnp_output {
        let msg = String::from_utf8_lossy(&out.stdout);
        for line in msg.lines() {
            let trimmed = line.trim();
            if trimmed.contains("Published name")
                || trimmed.contains("successfully")
                || trimmed.contains("Driver package")
            {
                println!("[+] pnputil: {}", trimmed);
            }
        }
    }

    // 2. Clean up any stale instances before creating a new device node
    let _ = remove_devices_by_hwid(HARDWARE_ID);

    // 3. Register root-enumerated PnP device node (Sensor setup class)
    println!("[*] Creating root-enumerated virtual GNSS PnP device node...");
    let sensor_guid = SENSOR_CLASS_GUID;

    unsafe {
        let dev_info = SetupDiCreateDeviceInfoList(Some(&sensor_guid), None)
            .map_err(|e| anyhow::anyhow!("SetupDiCreateDeviceInfoList failed: {:?}", e))?;

        let mut dev_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ClassGuid: sensor_guid,
            DevInst: 0,
            Reserved: 0,
        };

        // DevCon pattern: DeviceName is ClassName ("Sensor") and CreationFlags is DICD_GENERATE_ID (1)
        let class_name: Vec<u16> = "Sensor\0".encode_utf16().collect();
        let mut create_res = SetupDiCreateDeviceInfoW(
            dev_info,
            PCWSTR(class_name.as_ptr()),
            &sensor_guid,
            None,
            None,
            DICD_GENERATE_ID,
            Some(&mut dev_data),
        );

        if create_res.is_err() {
            // Fallback: try with NULL DeviceName and DICD_GENERATE_ID
            create_res = SetupDiCreateDeviceInfoW(
                dev_info,
                PCWSTR::null(),
                &sensor_guid,
                None,
                None,
                DICD_GENERATE_ID,
                Some(&mut dev_data),
            );
        }

        if create_res.is_err() {
            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            return Err(anyhow::anyhow!("SetupDiCreateDeviceInfoW failed: {:?}", create_res));
        }

        // Set HardwareID property: REG_MULTI_SZ "Root\SarabGnss\0\0"
        let mut hwid_wide: Vec<u16> = HARDWARE_ID.encode_utf16().collect();
        hwid_wide.push(0); // string null terminator
        hwid_wide.push(0); // multi-sz list double null terminator
        let hwid_bytes: &[u8] = std::slice::from_raw_parts(
            hwid_wide.as_ptr() as *const u8,
            hwid_wide.len() * std::mem::size_of::<u16>(),
        );

        let prop_res = SetupDiSetDeviceRegistryPropertyW(
            dev_info,
            &mut dev_data,
            SPDRP_HARDWAREID,
            Some(hwid_bytes),
        );
        if prop_res.is_err() {
            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            return Err(anyhow::anyhow!("SetupDiSetDeviceRegistryPropertyW failed: {:?}", prop_res));
        }

        let reg_res = SetupDiCallClassInstaller(DIF_REGISTERDEVICE, dev_info, Some(&mut dev_data));
        let _ = SetupDiDestroyDeviceInfoList(dev_info);

        if reg_res.is_err() {
            return Err(anyhow::anyhow!("DIF_REGISTERDEVICE failed: {:?}", reg_res));
        }
        println!("[+] Device node registered successfully.");

        // 4. Update and install driver for the registered PnP device
        println!("[*] Installing and binding UMDF driver to virtual device...");
        let wide_hwid: Vec<u16> = HARDWARE_ID.encode_utf16().chain(std::iter::once(0)).collect();
        let mut reboot_required = BOOL(0);

        let update_res = UpdateDriverForPlugAndPlayDevicesW(
            None,
            PCWSTR(wide_hwid.as_ptr()),
            PCWSTR(wide_inf.as_ptr()),
            INSTALLFLAG_FORCE,
            Some(&mut reboot_required),
        );

        if update_res.is_err() {
            println!("[-] UpdateDriverForPlugAndPlayDevicesW notice: {:?}. Triggering PnP scan...", update_res);
            let _ = std::process::Command::new("pnputil")
                .args(["/scan-devices"])
                .output();
        } else {
            println!("[+] Driver attached and active.");
        }

        if reboot_required.as_bool() {
            println!("[!] Note: Windows reported a system restart is recommended to complete driver initialization.");
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn uninstall_driver_device() -> Result<()> {
    let removed_count = remove_devices_by_hwid(HARDWARE_ID);

    if removed_count == 0 {
        println!("[-] No registered Sarab Virtual GNSS devices found.");
    } else {
        println!("[+] Successfully removed {} device instance(s).", removed_count);
    }

    // Clean up INF from driver store via pnputil
    let _ = std::process::Command::new("pnputil")
        .args(["/delete-driver", "SarabGnss.inf", "/uninstall", "/force"])
        .output();

    Ok(())
}

// Fallbacks for non-Windows platforms
#[cfg(not(windows))]
pub fn install_certificate_to_stores(_cer_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn install_driver_device(_inf_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub fn uninstall_driver_device() -> Result<()> {
    Ok(())
}
