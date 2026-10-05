mod cli;
mod config;
mod driver_comm;
mod installer;
mod reader;
mod simple;

use anyhow::Result;
use clap::Parser;
use cli::{Cli, Commands, DriverAction};
use config::{validate_coordinates, SpoofConfig};

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Set(args) => {
            validate_coordinates(args.lat, args.lon, args.alt, args.acc)?;

            let config = SpoofConfig {
                lat: args.lat,
                lon: args.lon,
                alt: args.alt,
                acc: args.acc,
                enabled: true,
            };

            driver_comm::set_driver_parameters(&config)?;
            config::save_local_config(&config)?;

            println!("[+] Spoof coordinates successfully applied to driver parameters:");
            println!("    Latitude:  {:.7}°", config.lat);
            println!("    Longitude: {:.7}°", config.lon);
            println!("    Altitude:  {:.2} m", config.alt);
            println!("    Accuracy:  {:.1} m", config.acc);
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
            println!("Test Signing Mode: {}", if test_signing { "ENABLED (OK)" } else { "DISABLED (Requires: bcdedit /set testsigning on)" });
            println!("Location Privacy:  {}", if privacy_ok { "ALLOWED (OK)" } else { &privacy_desc });
            println!("BitLocker Status:  {}", bitlocker_status);
            println!("Boot Options:      {}", boot_opts);
            println!("Spoof Active:      {}", if current_config.enabled { "YES" } else { "NO" });
            println!("Configured Lat:    {:.7}°", current_config.lat);
            println!("Configured Lon:    {:.7}°", current_config.lon);
            println!("Configured Alt:    {:.2} m", current_config.alt);
            println!("Configured Acc:    {:.1} m", current_config.acc);
            println!("=====================================================\n");
        }

        Commands::Driver(args) => match args.action {
            DriverAction::Install { inf } => {
                let (inf_path, cer_path) = installer::find_driver_files(inf)?;
                println!("[*] Found Driver INF: {:?}", inf_path);
                println!("[*] Found Certificate: {:?}", cer_path);

                let (test_signing, _) = installer::check_test_signing_mode();
                if !test_signing {
                    println!("[!] WARNING: Windows Test Signing mode is NOT enabled!");
                    println!("    To load UMDF test drivers, run in an Administrator terminal:");
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
        },

        Commands::Read => {
            reader::read_windows_location()?;
        }

        Commands::Simple(args) => {
            validate_coordinates(args.lat, args.lon, 0.0, 5.0)?;
            simple::set_simple_default_location(args.lat, args.lon)?;
        }
    }

    Ok(())
}
