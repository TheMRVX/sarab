mod cli;
mod config;
pub mod dead_reckoning;
mod driver_comm;
mod gpx;
mod installer;
mod kinematics;
pub mod nmea;
pub mod nmea_broadcaster;
mod reader;
mod route_runner;
pub mod service;
mod simple;
mod web;
pub mod wifi_shield;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Commands, DriverAction};
use config::{validate_coordinates, SpoofConfig};

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Set(args) => {
            validate_coordinates(args.lat, args.lon, args.alt, args.acc)?;
            config::validate_drift(args.drift_radius)?;

            let config = SpoofConfig {
                lat: args.lat,
                lon: args.lon,
                alt: args.alt,
                acc: args.acc,
                enabled: true,
                drift_enabled: args.drift,
                drift_radius: args.drift_radius,
            };

            driver_comm::set_driver_parameters(&config)?;
            config::save_local_config(&config)?;

            println!("[+] Spoof coordinates successfully applied to driver parameters:");
            println!("    Latitude:  {:.7}°", config.lat);
            println!("    Longitude: {:.7}°", config.lon);
            println!("    Altitude:  {:.2} m", config.alt);
            println!("    Accuracy:  {:.1} m", config.acc);
            println!(
                "    Drift:     {}",
                if config.drift_enabled {
                    format!("ENABLED (±{:.1}m Gauss-Markov OU)", config.drift_radius)
                } else {
                    "DISABLED".to_string()
                }
            );
            println!("    State:     ACTIVE");
        }

        Commands::Enable => {
            driver_comm::set_driver_enabled(true)?;
            println!("[+] Spoofing ENABLED. The virtual GNSS driver is feeding coordinates to Windows Location Service.");
        }

        Commands::Disable => {
            driver_comm::set_driver_enabled(false)?;
            println!("[-] Spoofing DISABLED. The virtual GNSS driver will not provide fixes until re-enabled.");
        }

        Commands::Status(args) => {
            let (test_signing, boot_opts) = installer::check_test_signing_mode();
            let (privacy_ok, privacy_desc) = reader::check_location_privacy_consent();
            let bitlocker_status = installer::check_bitlocker_status();
            let (driver_installed, driver_running) = installer::get_driver_state();
            let current_config = driver_comm::get_driver_parameters().unwrap_or_default();

            if args.json {
                #[derive(serde::Serialize)]
                struct StatusJson {
                    test_signing: bool,
                    boot_options: String,
                    location_privacy: bool,
                    location_privacy_details: String,
                    bitlocker: String,
                    driver_installed: bool,
                    driver_running: bool,
                    spoof_enabled: bool,
                    latitude: f64,
                    longitude: f64,
                    altitude: f64,
                    accuracy: f64,
                    drift_enabled: bool,
                    drift_radius: f64,
                    version: &'static str,
                }

                let status_obj = StatusJson {
                    test_signing,
                    boot_options: boot_opts,
                    location_privacy: privacy_ok,
                    location_privacy_details: privacy_desc,
                    bitlocker: bitlocker_status,
                    driver_installed,
                    driver_running,
                    spoof_enabled: current_config.enabled,
                    latitude: current_config.lat,
                    longitude: current_config.lon,
                    altitude: current_config.alt,
                    accuracy: current_config.acc,
                    drift_enabled: current_config.drift_enabled,
                    drift_radius: current_config.drift_radius,
                    version: "1.0.2",
                };

                println!("{}", serde_json::to_string_pretty(&status_obj)?);
                return Ok(());
            }

            println!("\n================ Sarab System Status ================");
            println!(
                "Test Signing Mode: {}",
                if test_signing {
                    "ENABLED (OK)"
                } else {
                    "DISABLED (Requires: bcdedit /set testsigning on)"
                }
            );
            println!(
                "Location Privacy:  {}",
                if privacy_ok {
                    "ALLOWED (OK)"
                } else {
                    &privacy_desc
                }
            );
            println!("BitLocker Status:  {}", bitlocker_status);
            println!("Boot Options:      {}", boot_opts);
            println!(
                "Driver Installed:  {}",
                if driver_installed { "YES" } else { "NO" }
            );
            println!(
                "Driver Running:    {}",
                if driver_running {
                    "YES (Healthy - ProblemCode: 0)"
                } else {
                    "NO / ERROR (Check Device Manager)"
                }
            );
            println!(
                "Spoof Active:      {}",
                if current_config.enabled { "YES" } else { "NO" }
            );
            println!("Configured Lat:    {:.7}°", current_config.lat);
            println!("Configured Lon:    {:.7}°", current_config.lon);
            println!("Configured Alt:    {:.2} m", current_config.alt);
            println!("Configured Acc:    {:.1} m", current_config.acc);
            println!(
                "Natural Drift:     {}",
                if current_config.drift_enabled {
                    format!(
                        "ENABLED (±{:.1}m Gauss-Markov OU)",
                        current_config.drift_radius
                    )
                } else {
                    "DISABLED".to_string()
                }
            );
            println!("=====================================================\n");
        }

        Commands::Driver(args) => {
            match args.action {
                DriverAction::Install { inf } => {
                    let (inf_path, cer_path) = installer::find_driver_files(inf)?;
                    println!("[*] Found Driver INF: {:?}", inf_path);
                    println!("[*] Found Certificate: {:?}", cer_path);

                    let (test_signing, _) = installer::check_test_signing_mode();
                    if !test_signing {
                        println!("[!] WARNING: Windows Test Signing mode is NOT enabled!");
                        println!(
                            "    To load UMDF test drivers, run in an Administrator terminal:"
                        );
                        println!("    > bcdedit /set testsigning on");
                        println!("    > shutdown /r /t 0");
                        println!("    (Ensure Secure Boot is turned OFF in your BIOS)\n");
                        println!("[!] BITLOCKER SAFETY ADVISORY:");
                        println!("    If BitLocker encryption is active on drive C:, altering BCD boot settings");
                        println!("    or turning off Secure Boot may trigger BitLocker Recovery Mode on reboot!");
                        println!("    -> Have your 48-digit BitLocker recovery key accessible, OR");
                        println!("    -> Temporarily suspend BitLocker protection for 1 reboot:");
                        println!("       manage-bde -protectors -disable C: -RebootCount 1\n");
                    }

                    if cer_path.exists() {
                        println!("[*] Installing test certificate into Root and TrustedPublisher stores...");
                        installer::install_certificate_to_stores(&cer_path)?;
                        println!("[+] Certificate installed successfully.");
                    } else {
                        println!("[!] Certificate file {:?} not found, skipping certificate installation.", cer_path);
                    }

                    println!("[*] Registering PnP device and installing driver...");
                    installer::install_driver_device(&inf_path)?;
                    println!("[+] Sarab Virtual GNSS Driver installed successfully.");
                    println!("[+] Device registered under Sensors in Device Manager.");
                }

                DriverAction::Uninstall => {
                    println!("[*] Uninstalling Sarab Virtual GNSS Device and driver package...");
                    installer::uninstall_driver_device()?;
                    println!("[+] Driver and device removal completed.");
                }
            }
        }

        Commands::Read(args) => {
            reader::read_windows_location(args.json)?;
        }

        Commands::Simple(args) => {
            validate_coordinates(args.lat, args.lon, 0.0, 5.0)?;
            simple::set_simple_default_location(args.lat, args.lon)?;
        }

        Commands::Gui(args) | Commands::Web(args) => {
            web::start_server(&args.host, args.port, args.open)?;
        }

        Commands::Route(args) => match args.action {
            cli::RouteAction::Play(play_args) => {
                let xml = std::fs::read_to_string(&play_args.file).map_err(|e| {
                    anyhow::anyhow!("Failed to read GPX file '{}': {}", play_args.file, e)
                })?;
                let track = gpx::parse_gpx(&xml)?;
                println!(
                    "[+] Successfully loaded GPX track: '{}' with {} waypoints ({:.2} km)",
                    track.name.as_deref().unwrap_or("Unnamed"),
                    track.waypoints.len(),
                    track.total_distance_meters / 1000.0
                );

                let runner = route_runner::RouteRunner::new();
                runner.start(
                    track.waypoints,
                    play_args.speed,
                    play_args.loop_route,
                    route_runner::RouteProfile::Driving,
                )?;

                println!(
                    "[+] Headless route simulation started at {:.1} km/h (loop: {})",
                    play_args.speed, play_args.loop_route
                );
                println!("[*] Press Ctrl+C to terminate simulation.\n");

                while runner.get_status().is_running {
                    let st = runner.get_status();
                    print!(
                        "\r[*] Progress: {:.1}% | Pos: ({:.6}°, {:.6}°) | Heading: {:.1}° | Speed: {:.1} km/h   ",
                        st.progress_percent,
                        st.current_lat,
                        st.current_lon,
                        st.current_heading,
                        st.current_speed_kmh
                    );
                    let _ = std::io::Write::flush(&mut std::io::stdout());
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                }
                println!("\n[+] Route simulation completed.");
            }
            cli::RouteAction::Status => {
                let token = config::get_session_token_path();
                let token_str = std::fs::read_to_string(token)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let port = config::get_active_port();

                let client_res = ureq::get(&format!("http://127.0.0.1:{}/api/route/status", port))
                    .set("X-Sarab-Token", &token_str)
                    .timeout(std::time::Duration::from_secs(2))
                    .call();

                match client_res {
                    Ok(resp) => {
                        if let Ok(st) = resp.into_json::<crate::route_runner::RouteStatus>() {
                            println!("\n================ Route Simulation Status ================");
                            println!(
                                "Simulation Active: {}",
                                if st.is_running { "YES" } else { "NO" }
                            );
                            println!(
                                "Paused:            {}",
                                if st.is_paused { "YES" } else { "NO" }
                            );
                            if st.is_running {
                                println!("Progress:          {:.1}%", st.progress_percent);
                                println!(
                                    "Current Position:  {:.7}°, {:.7}° (alt: {:.1} m)",
                                    st.current_lat, st.current_lon, st.current_alt
                                );
                                println!("Current Speed:     {:.1} km/h", st.current_speed_kmh);
                                println!("Current Heading:   {:.1}°", st.current_heading);
                                println!(
                                    "Waypoints:         {}/{}",
                                    st.current_index + 1,
                                    st.total_waypoints
                                );
                            }
                            println!("=========================================================\n");
                        }
                    }
                    Err(_) => {
                        println!(
                            "[-] Sarab service/daemon is not reachable on port {}.",
                            port
                        );
                        let cfg = driver_comm::get_driver_parameters().unwrap_or_default();
                        println!("=== Current Driver Static Coordinates ===");
                        println!("Latitude:  {:.7}°", cfg.lat);
                        println!("Longitude: {:.7}°", cfg.lon);
                        println!("Altitude:  {:.2} m", cfg.alt);
                        println!("Enabled:   {}", cfg.enabled);
                    }
                }
            }
            cli::RouteAction::Stop => {
                let token = config::get_session_token_path();
                let token_str = std::fs::read_to_string(token)
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let port = config::get_active_port();

                let client_res = ureq::post(&format!("http://127.0.0.1:{}/api/route/stop", port))
                    .set("X-Sarab-Token", &token_str)
                    .timeout(std::time::Duration::from_secs(2))
                    .call();

                match client_res {
                    Ok(_) => {
                        println!(
                            "[+] Route simulation stopped successfully in background service."
                        );
                    }
                    Err(e) => {
                        println!("[-] Failed to stop route in daemon (Is Sarab service running on port {}?): {}", port, e);
                    }
                }
            }
        },

        Commands::Service(args) => match args.action {
            cli::ServiceAction::Install { port } => {
                service::win::install_service(port)?;
            }
            cli::ServiceAction::Uninstall => {
                service::win::uninstall_service()?;
            }
            cli::ServiceAction::Start => {
                service::win::start_service()?;
            }
            cli::ServiceAction::Stop => {
                service::win::stop_service()?;
            }
            cli::ServiceAction::Status => {
                service::win::query_service_status()?;
            }
            cli::ServiceAction::Run { port } => {
                service::win::set_service_run_port(port);
                service::win::run_service()?;
            }
        },
    }

    Ok(())
}
