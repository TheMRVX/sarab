mod cli;
mod config;
mod driver_comm;
mod gpx;
mod installer;
mod kinematics;
pub mod nmea;
pub mod nmea_broadcaster;
mod reader;
mod route_runner;
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

        Commands::Status => {
            let (test_signing, boot_opts) = installer::check_test_signing_mode();
            let (privacy_ok, privacy_desc) = reader::check_location_privacy_consent();
            let bitlocker_status = installer::check_bitlocker_status();
            let current_config = driver_comm::get_driver_parameters().unwrap_or_default();

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
                    format!("ENABLED (±{:.1}m Gauss-Markov OU)", current_config.drift_radius)
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

        Commands::Read => {
            reader::read_windows_location()?;
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
                let xml = std::fs::read_to_string(&play_args.file)
                    .map_err(|e| anyhow::anyhow!("Failed to read GPX file '{}': {}", play_args.file, e))?;
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
                let cfg = driver_comm::get_driver_parameters()?;
                println!("=== Current Driver Telemetry ===");
                println!("Latitude:  {:.7}°", cfg.lat);
                println!("Longitude: {:.7}°", cfg.lon);
                println!("Altitude:  {:.2} m", cfg.alt);
                println!("Enabled:   {}", cfg.enabled);
            }
            cli::RouteAction::Stop => {
                let runner = route_runner::RouteRunner::new();
                runner.stop();
                println!("[+] Route simulation stopped.");
            }
        },
    }

    Ok(())
}
