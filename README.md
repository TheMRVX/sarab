# Sarab (سراب) — Windows Location Spoofer

[![CI Build](https://github.com/TheMRVX/sarab/actions/workflows/build.yml/badge.svg)](https://github.com/TheMRVX/sarab/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Sarab** (*Mirage*) is a high-precision, low-overhead location spoofer for Windows 10 and 11. It allows users to feed arbitrary geographical coordinates (latitude, longitude, altitude, accuracy) into the native Windows Location platform (`Windows.Devices.Geolocation`), making all location-aware applications (such as Windows Maps, Weather, Microsoft Edge, and Chrome) see the spoofed position as an authentic hardware sensor fix.

---

## Architecture Overview

Sarab operates via two complementary mechanisms:

1. **Advanced Mode (Recommended):**
   - Implements a User-Mode Driver Framework (UMDF 2.0) Virtual GNSS device (`SarabGnss.dll`).
   - Registers as a system sensor implementing `GUID_DEVINTERFACE_GNSS`.
   - Windows Location Framework (`lfsvc`) treats this as a primary physical GPS receiver, taking precedence over coarse Wi-Fi or IP-based geolocation.
   - Requires Windows **Test Signing Mode** (`bcdedit /set testsigning on`) with **Secure Boot disabled** in BIOS.

2. **Simple Mode (Fallback):**
   - Configures the Windows Location Service default coordinate registry entries.
   - Requires no driver or Test Mode, but Windows only falls back to it when no Wi-Fi or cellular location signals are available.

```
+-------------------------------------------------------------+
|                     User / Automation                       |
|                          sarab.exe                          |
+---------------------+-------------------+-------------------+
                      |                   |
        [Advanced Mode]                   | [Simple Mode]
                      v                   v
      +-------------------------------+ +---------------------+
      | HKLM\...\SarabGnss\Parameters | | HKLM\...\lfsvc\...  |
      +---------------+---------------+ +----------+----------+
                      |                            |
                      v                            |
      +-------------------------------+            |
      |   SarabGnss.dll (UMDF 2.0)    |            |
      |       WUDFHost.exe            |            |
      +---------------+---------------+            |
                      |                            |
                      v                            v
      +-------------------------------------------------------+
      |       Windows Location Service (lfsvc)                |
      +---------------------------+---------------------------+
                                  |
                                  v
      +-------------------------------------------------------+
      |     Applications (Maps, Weather, Browsers, UWP)       |
      +-------------------------------------------------------+
```

---

## Requirements & Prerequisites

- **Operating System:** Windows 10 (version 1809 or later) or Windows 11 (64-bit x64).
- **Permissions:** Administrator privileges (required for PnP device installation and system registry manipulation).
- **For Advanced Mode (Driver):**
  - **Secure Boot:** Disabled in motherboard BIOS / UEFI.
  - **Test Signing:** Enabled via `bcdedit /set testsigning on` (system restart required).

---

## Installation & Quick Start

### 1. Download Release
Download the latest `sarab-vX.Y.Z-x64.zip` from GitHub Releases or GitHub Actions Artifacts, and extract it to a directory (e.g., `C:\Sarab`).

### 2. Enable Test Signing (One-time setup for Advanced Mode)
Open **PowerShell** or **Command Prompt** as Administrator:
```powershell
bcdedit /set testsigning on
shutdown /r /t 0
```
*(Ensure Secure Boot is disabled in BIOS first, otherwise the command will fail).*

### 3. Install the Driver
Open Administrator Command Prompt in the extracted folder:
```cmd
sarab.exe driver install
```
Verify in **Device Manager** -> under **Sensors**, you will see **Sarab Virtual GNSS**.

### 4. Set Coordinates
Inject your desired location (e.g., Azadi Square, Tehran):
```cmd
sarab.exe set --lat 35.6997 --lon 51.3380 --alt 1200 --acc 5
```

Enable spoofing:
```cmd
sarab.exe enable
```

### 5. Verify Injected Location
Query the Windows Location API directly from the CLI:
```cmd
sarab.exe read
```
Open **Windows Maps** or visit [BrowserLeaks Geo](https://browserleaks.com/geo) in Edge/Chrome to confirm your new location.

---

## CLI Reference

```
Usage: sarab.exe <COMMAND>

Commands:
  set       Set spoof coordinates (latitude, longitude, altitude, accuracy)
  enable    Enable active coordinate spoofing
  disable   Disable spoofing (driver stops providing fixes)
  status    Check system state, driver status, and Windows Location service
  driver    Manage the Sarab Virtual GNSS driver (install / uninstall)
  read      Query live coordinates from Windows.Devices.Geolocation
  help      Print this message or the help of the given subcommand(s)
```

### Subcommand Options:

- `sarab.exe set --lat <LAT> --lon <LON> [--alt <ALT>] [--acc <ACC>]`
  - `--lat`: Latitude between -90.0 and 90.0 (degrees).
  - `--lon`: Longitude between -180.0 and 180.0 (degrees).
  - `--alt`: Altitude in meters (default: 0.0).
  - `--acc`: Horizontal accuracy in meters (default: 5.0).

- `sarab.exe driver install`
  - Automatically imports test certificate into `Root` and `TrustedPublisher` certificate stores.
  - Registers `Root\SarabGnss` device node via Windows SetupAPI.
  - Installs and starts the UMDF 2.0 driver.

- `sarab.exe driver uninstall`
  - Unregisters and removes the PnP device.
  - Deletes driver package from the Windows Driver Store using PnPUtil.

---

## Building from Source

### Automated CI
The repository uses GitHub Actions (`.github/workflows/build.yml`) to automatically compile the C++ UMDF 2.0 driver and Rust CLI, generate self-signed test certificates, sign the driver package, and produce release ZIPs.

### Local Build Requirements
- **Driver:** Visual Studio 2022 with C++ desktop development and Windows Driver Kit (WDK) 10/11.
- **CLI:** Rust toolchain (`cargo build --release`).

---

## Security & Cleanup

To restore your system completely to its original state:
```cmd
sarab.exe disable
sarab.exe driver uninstall
bcdedit /set testsigning off
shutdown /r /t 0
```
Re-enable Secure Boot in your BIOS if desired.

---

## License

Licensed under the [MIT License](LICENSE).
