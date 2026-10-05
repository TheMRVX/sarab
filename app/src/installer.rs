use anyhow::Result;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
pub const HARDWARE_ID: &str = "Root\\SarabGnss";
#[allow(dead_code)]
pub const SENSOR_CLASS_GUID_STR: &str = "{5175D334-C371-4806-B3BA-71FD53C9258D}";

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
                    RegCloseKey(hkey);
                    let len = (size as usize) / 2;
                    let opts = String::from_utf16_lossy(&buf[..len]).to_uppercase();
                    let enabled = opts.contains("TESTSIGNING");
                    return (enabled, opts.trim().to_string());
                }
                RegCloseKey(hkey);
            }
        }
    }
    (false, "Unknown".to_string())
}

#[cfg(windows)]
pub fn install_certificate_to_stores(cer_path: &Path) -> Result<()> {
    use anyhow::Context;
    use windows::core::PCWSTR;
    use windows::Win32::Security::Cryptography::{
        CertAddCertificateContextToStore, CertCloseStore, CertCreateCertificateContext,
        CertOpenStore, CERT_CONTEXT, CERT_STORE_ADD_REPLACE_EXISTING,
        CERT_STORE_PROV_SYSTEM_W, CERT_SYSTEM_STORE_LOCAL_MACHINE, X509_ASN_ENCODING,
    };

    if !cer_path.exists() {
        return Err(anyhow::anyhow!(
            "Certificate file not found at: {:?}. Ensure driver package includes SarabGnss.cer.",
            cer_path
        ));
    }

    let cert_bytes = std::fs::read(cer_path)
        .with_context(|| format!("Failed to read certificate file {:?}", cer_path))?;

    let stores = ["ROOT", "TrustedPublisher"];

    for store_name in stores {
        let wide_name: Vec<u16> = store_name.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let h_store = CertOpenStore(
                CERT_STORE_PROV_SYSTEM_W,
                0,
                0,
                CERT_SYSTEM_STORE_LOCAL_MACHINE,
                Some(wide_name.as_ptr() as *const _),
            );
            if h_store.is_invalid() {
                return Err(anyhow::anyhow!("Failed to open certificate store: {}", store_name));
            }

            let cert_context: *const CERT_CONTEXT = CertCreateCertificateContext(
                X509_ASN_ENCODING,
                cert_bytes.as_ptr(),
                cert_bytes.len() as u32,
            );
            if cert_context.is_null() {
                let _ = CertCloseStore(h_store, 0);
                return Err(anyhow::anyhow!("Failed to parse certificate context"));
            }

            let add_res = CertAddCertificateContextToStore(
                h_store,
                cert_context,
                CERT_STORE_ADD_REPLACE_EXISTING,
                None,
            );

            let _ = CertCloseStore(h_store, 0);

            if add_res.is_err() {
                return Err(anyhow::anyhow!("Failed to add certificate to {} store", store_name));
            }
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn install_driver_device(inf_path: &Path) -> Result<()> {
    use anyhow::Context;
    use windows::core::{GUID, PCWSTR};
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiCallClassInstaller, SetupDiCreateDeviceInfoList, SetupDiCreateDeviceInfoW,
        SetupDiDestroyDeviceInfoList, SetupDiSetDeviceRegistryPropertyW,
        UpdateDriverForPlugAndPlayDevicesW, DIF_REGISTERDEVICE, INSTALLFLAG_FORCE,
        SPDRP_HARDWAREID, SP_DEVINFO_DATA,
    };
    use windows::Win32::Foundation::BOOL;

    let abs_inf = std::fs::canonicalize(inf_path)
        .with_context(|| format!("Driver INF file not found: {:?}", inf_path))?;
    let inf_str = abs_inf.to_string_lossy().to_string();
    let wide_inf: Vec<u16> = inf_str.encode_utf16().chain(std::iter::once(0)).collect();

    // Sensor class GUID: {5175D334-C371-4806-B3BA-71FD53C9258D}
    let sensor_guid = GUID::from(SENSOR_CLASS_GUID_STR);

    unsafe {
        let dev_info = SetupDiCreateDeviceInfoList(Some(&sensor_guid), None)
            .context("SetupDiCreateDeviceInfoList failed")?;

        let mut dev_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ClassGuid: sensor_guid,
            DevInst: 0,
            Reserved: 0,
        };

        let device_name: Vec<u16> = "SarabGnss".encode_utf16().chain(std::iter::once(0)).collect();
        let create_res = SetupDiCreateDeviceInfoW(
            dev_info,
            PCWSTR(device_name.as_ptr()),
            &sensor_guid,
            None,
            None,
            0,
            Some(&mut dev_data),
        );
        if create_res.is_err() {
            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            return Err(anyhow::anyhow!("SetupDiCreateDeviceInfoW failed: {:?}", create_res));
        }

        // HardwareID: "Root\SarabGnss\0\0" (REG_MULTI_SZ)
        let mut hwid_bytes: Vec<u8> = Vec::new();
        for &c in HARDWARE_ID.as_bytes() {
            hwid_bytes.push(c);
            hwid_bytes.push(0);
        }
        hwid_bytes.push(0);
        hwid_bytes.push(0);
        hwid_bytes.push(0);
        hwid_bytes.push(0);

        let prop_res = SetupDiSetDeviceRegistryPropertyW(
            dev_info,
            &dev_data,
            SPDRP_HARDWAREID,
            Some(&hwid_bytes),
        );
        if prop_res.is_err() {
            let _ = SetupDiDestroyDeviceInfoList(dev_info);
            return Err(anyhow::anyhow!("SetupDiSetDeviceRegistryPropertyW failed: {:?}", prop_res));
        }

        let reg_res = SetupDiCallClassInstaller(DIF_REGISTERDEVICE, dev_info, Some(&dev_data));
        let _ = SetupDiDestroyDeviceInfoList(dev_info);

        if reg_res.is_err() {
            return Err(anyhow::anyhow!("DIF_REGISTERDEVICE failed: {:?}", reg_res));
        }

        // Install and update driver for the registered PnP device
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
            return Err(anyhow::anyhow!(
                "UpdateDriverForPlugAndPlayDevicesW failed: {:?}. Is Test Signing mode active?",
                update_res
            ));
        }

        if reboot_required.as_bool() {
            println!("[!] Note: Windows reported a system restart is recommended to complete driver initialization.");
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn uninstall_driver_device() -> Result<()> {
    use windows::core::{GUID, PCWSTR};
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiCallClassInstaller, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
        SetupDiGetClassDevsW, SetupDiGetDeviceRegistryPropertyW, DIF_REMOVE, DIGCF_ALLCLASSES,
        SPDRP_HARDWAREID, SP_DEVINFO_DATA,
    };

    unsafe {
        let dev_info = SetupDiGetClassDevsW(None, None, None, DIGCF_ALLCLASSES);
        if dev_info.is_invalid() {
            return Err(anyhow::anyhow!("SetupDiGetClassDevsW failed"));
        }

        let mut dev_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ClassGuid: GUID::zeroed(),
            DevInst: 0,
            Reserved: 0,
        };

        let mut index = 0;
        let mut removed_count = 0;

        while SetupDiEnumDeviceInfo(dev_info, index, &mut dev_data).is_ok() {
            let mut buf = [0u8; 512];
            let mut req_size = 0;

            if SetupDiGetDeviceRegistryPropertyW(
                dev_info,
                &dev_data,
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
                if hwid_str.contains("Root\\SarabGnss") {
                    println!("[+] Removing device: {}", hwid_str.trim_matches('\0'));
                    let _ = SetupDiCallClassInstaller(DIF_REMOVE, dev_info, Some(&dev_data));
                    removed_count += 1;
                }
            }
            index += 1;
        }

        let _ = SetupDiDestroyDeviceInfoList(dev_info);

        if removed_count == 0 {
            println!("[-] No registered Sarab Virtual GNSS devices found.");
        } else {
            println!("[+] Successfully removed {} device instance(s).", removed_count);
        }

        // Clean up INF from driver store via pnputil
        let _ = std::process::Command::new("pnputil")
            .args(["/delete-driver", "SarabGnss.inf", "/uninstall", "/force"])
            .output();
    }

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
