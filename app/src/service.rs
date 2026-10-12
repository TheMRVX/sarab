#[cfg(windows)]
pub mod win {
    use anyhow::{Context, Result};
    use std::ffi::{OsStr, OsString};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;
    use windows_service::{
        define_windows_service,
        service::{
            ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl,
            ServiceExitCode, ServiceInfo, ServiceStartType, ServiceState, ServiceStatus,
            ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    pub const SERVICE_NAME: &str = "SarabService";
    pub const SERVICE_DISPLAY_NAME: &str = "Sarab Virtual GNSS Service";
    pub const SERVICE_DESCRIPTION: &str =
        "Provides background GPS location spoofing and HTTP control API for Sarab GNSS.";

    define_windows_service!(ffi_service_main, sarab_service_main);

    static SERVICE_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(8090);

    pub fn set_service_run_port(port: u16) {
        SERVICE_PORT.store(port, Ordering::SeqCst);
    }

    pub fn run_service() -> Result<()> {
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)
            .context("Failed to start service control dispatcher")?;
        Ok(())
    }

    fn sarab_service_main(arguments: Vec<OsString>) {
        if let Err(e) = run_service_loop(arguments) {
            eprintln!("[-] Sarab Service encountered an error: {:?}", e);
        }
    }

    fn run_service_loop(_args: Vec<OsString>) -> Result<()> {
        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop | ServiceControl::Shutdown => {
                    stop_signal_clone.store(true, Ordering::SeqCst);
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)
            .context("Failed to register service control handler")?;

        status_handle
            .set_service_status(ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Running,
                controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: Duration::default(),
                process_id: None,
            })
            .context("Failed to set service status to Running")?;

        let port = SERVICE_PORT.load(Ordering::SeqCst);
        let _server_thread = std::thread::spawn(move || {
            let _ = crate::web::start_server("127.0.0.1", port, false);
        });

        while !stop_signal.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(500));
        }

        status_handle
            .set_service_status(ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Stopped,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: Duration::default(),
                process_id: None,
            })
            .context("Failed to set service status to Stopped")?;

        Ok(())
    }

    pub fn install_service(port: u16) -> Result<()> {
        let current_exe = std::env::current_exe().context("Failed to get current executable path")?;
        let exe_path = current_exe.to_string_lossy();
        let binary_path = format!("\"{}\" service run --port {}", exe_path, port);

        let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CREATE_SERVICE)
            .context("Failed to connect to Service Control Manager (administrator privileges required)")?;

        let service_info = ServiceInfo {
            name: OsString::from(SERVICE_NAME),
            display_name: OsString::from(SERVICE_DISPLAY_NAME),
            service_type: ServiceType::OWN_PROCESS,
            start_type: ServiceStartType::AutoStart,
            error_control: ServiceErrorControl::Normal,
            executable_path: std::path::PathBuf::from(&binary_path),
            launch_arguments: vec![],
            dependencies: vec![],
            account_name: None,
            account_password: None,
        };

        let _service = manager
            .create_service(&service_info, ServiceAccess::empty())
            .context("Failed to create SarabService in SCM")?;

        println!("[+] Sarab Windows Service installed successfully.");
        println!("    Service Name:  {}", SERVICE_NAME);
        println!("    Display Name:  {}", SERVICE_DISPLAY_NAME);
        println!("    Startup Type:  Automatic (AutoStart)");
        println!("    Binary Path:   {}", binary_path);
        println!("    HTTP API:      http://127.0.0.1:{}", port);
        Ok(())
    }

    pub fn uninstall_service() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT)
            .context("Failed to connect to Service Control Manager")?;

        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::STOP | ServiceAccess::DELETE | ServiceAccess::QUERY_STATUS,
            )
            .context("Failed to open SarabService (is it installed?)")?;

        if let Ok(status) = service.query_status() {
            if status.current_state == ServiceState::Running {
                println!("[*] Stopping Sarab Windows Service...");
                let _ = service.stop();
                std::thread::sleep(Duration::from_secs(1));
            }
        }

        service.delete().context("Failed to delete SarabService")?;
        println!("[+] Sarab Windows Service uninstalled successfully.");
        Ok(())
    }

    pub fn start_service() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT)
            .context("Failed to connect to Service Control Manager")?;

        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::START | ServiceAccess::QUERY_STATUS,
            )
            .context("Failed to open SarabService (is it installed?)")?;

        let status = service.query_status().context("Failed to query status")?;
        if status.current_state == ServiceState::Running {
            println!("[*] Sarab Windows Service is already RUNNING.");
            return Ok(());
        }

        println!("[*] Starting Sarab Windows Service...");
        let empty_args: &[&OsStr] = &[];
        service.start(empty_args).context("Failed to start SarabService")?;
        println!("[+] Sarab Windows Service started successfully.");
        Ok(())
    }

    pub fn stop_service() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT)
            .context("Failed to connect to Service Control Manager")?;

        let service = manager
            .open_service(
                SERVICE_NAME,
                ServiceAccess::STOP | ServiceAccess::QUERY_STATUS,
            )
            .context("Failed to open SarabService (is it installed?)")?;

        let status = service.query_status().context("Failed to query status")?;
        if status.current_state == ServiceState::Stopped {
            println!("[*] Sarab Windows Service is already STOPPED.");
            return Ok(());
        }

        println!("[*] Stopping Sarab Windows Service...");
        service.stop().context("Failed to stop SarabService")?;
        println!("[+] Sarab Windows Service stopped successfully.");
        Ok(())
    }

    pub fn query_service_status() -> Result<()> {
        let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT)
            .context("Failed to connect to Service Control Manager")?;

        let service = manager
            .open_service(SERVICE_NAME, ServiceAccess::QUERY_STATUS)
            .context("Failed to open SarabService (is it installed?)")?;

        let status = service.query_status().context("Failed to query status")?;
        println!("\n=========== Sarab Windows Service Status ===========");
        println!("Service Name:  {}", SERVICE_NAME);
        println!("Display Name:  {}", SERVICE_DISPLAY_NAME);
        println!("Current State: {:?}", status.current_state);
        println!("Service Type:  {:?}", status.service_type);
        println!("Process ID:    {:?}", status.process_id);
        println!("====================================================\n");
        Ok(())
    }

    pub fn query_service_api_status() -> super::ServiceApiStatus {
        let manager = match ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT) {
            Ok(m) => m,
            Err(_) => {
                return super::ServiceApiStatus {
                    supported: true,
                    installed: false,
                    running: false,
                    state: "SCM Inaccessible".to_string(),
                    service_name: SERVICE_NAME.to_string(),
                    display_name: SERVICE_DISPLAY_NAME.to_string(),
                }
            }
        };

        match manager.open_service(SERVICE_NAME, ServiceAccess::QUERY_STATUS) {
            Ok(service) => match service.query_status() {
                Ok(status) => super::ServiceApiStatus {
                    supported: true,
                    installed: true,
                    running: status.current_state == ServiceState::Running,
                    state: format!("{:?}", status.current_state),
                    service_name: SERVICE_NAME.to_string(),
                    display_name: SERVICE_DISPLAY_NAME.to_string(),
                },
                Err(e) => super::ServiceApiStatus {
                    supported: true,
                    installed: true,
                    running: false,
                    state: format!("Query Error: {:?}", e),
                    service_name: SERVICE_NAME.to_string(),
                    display_name: SERVICE_DISPLAY_NAME.to_string(),
                },
            },
            Err(_) => super::ServiceApiStatus {
                supported: true,
                installed: false,
                running: false,
                state: "Not Installed".to_string(),
                service_name: SERVICE_NAME.to_string(),
                display_name: SERVICE_DISPLAY_NAME.to_string(),
            },
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ServiceApiStatus {
    pub supported: bool,
    pub installed: bool,
    pub running: bool,
    pub state: String,
    pub service_name: String,
    pub display_name: String,
}

#[cfg(not(windows))]
pub mod win {
    use anyhow::Result;

    pub fn set_service_run_port(_port: u16) {}

    pub fn run_service() -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn install_service(_port: u16) -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn uninstall_service() -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn start_service() -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn stop_service() -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn query_service_status() -> Result<()> {
        anyhow::bail!("Windows Service is only supported on Windows operating systems.");
    }

    pub fn query_service_api_status() -> super::ServiceApiStatus {
        super::ServiceApiStatus {
            supported: false,
            installed: false,
            running: false,
            state: "Not Supported on Linux".to_string(),
            service_name: "SarabService".to_string(),
            display_name: "Sarab Virtual GNSS Service".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_api_status() {
        let status = win::query_service_api_status();
        assert_eq!(status.service_name, "SarabService");
        assert!(!status.display_name.is_empty());
    }
}
