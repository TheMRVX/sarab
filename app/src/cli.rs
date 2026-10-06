use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "sarab",
    author = "TheMRVX",
    version,
    about = "Sarab (Mirage) — High-precision GPS location spoofer for Windows 10/11",
    long_about = "Sarab feeds arbitrary GPS coordinates directly into the Windows Location API via a virtual GNSS sensor driver."
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Set spoof coordinates (latitude, longitude, altitude, accuracy)
    Set(SetArgs),

    /// Enable active coordinate spoofing in the driver
    Enable,

    /// Disable coordinate spoofing (driver stops providing fixes)
    Disable,

    /// Query system state, driver status, and active coordinates
    Status,

    /// Manage the Sarab Virtual GNSS driver (install / uninstall)
    Driver(DriverArgs),

    /// Query live coordinates reported by Windows.Devices.Geolocation
    Read,

    /// Configure Simple Mode (sets default location in registry without driver)
    Simple(SimpleArgs),
}

#[derive(Args, Debug)]
pub struct SetArgs {
    /// Latitude in decimal degrees (-90.0 to 90.0)
    #[arg(short, long)]
    pub lat: f64,

    /// Longitude in decimal degrees (-180.0 to 180.0)
    #[arg(short = 'o', long)]
    pub lon: f64,

    /// Altitude in meters above sea level (default: 0.0)
    #[arg(short, long, default_value_t = 0.0)]
    pub alt: f64,

    /// Horizontal accuracy radius in meters (default: 5.0)
    #[arg(short = 'c', long, default_value_t = 5.0)]
    pub acc: f64,
}

#[derive(Args, Debug)]
pub struct DriverArgs {
    #[command(subcommand)]
    pub action: DriverAction,
}

#[derive(Subcommand, Debug)]
pub enum DriverAction {
    /// Register device, import test certificate, and install driver
    Install {
        /// Optional path to SarabGnss.inf (defaults to current directory)
        #[arg(short, long)]
        inf: Option<String>,
    },

    /// Unregister device, remove driver, and clean up Windows Driver Store
    Uninstall,
}

#[derive(Args, Debug)]
pub struct SimpleArgs {
    /// Latitude in decimal degrees (-90.0 to 90.0)
    #[arg(short, long)]
    pub lat: f64,

    /// Longitude in decimal degrees (-180.0 to 180.0)
    #[arg(short, long)]
    pub lon: f64,
}
