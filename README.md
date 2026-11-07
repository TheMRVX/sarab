<div align="center">

# Sarab

**Virtual GNSS location provider and testing toolkit for Windows**

A test-focused location provider that supplies configurable coordinates to the Windows Location platform through a user-mode virtual GNSS driver. A Rust CLI and locally served React dashboard manage location fixes, diagnostics, and route simulations.

[![CI](https://github.com/TheMRVX/sarab/actions/workflows/ci.yml/badge.svg)](https://github.com/TheMRVX/sarab/actions/workflows/ci.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/themrvx/sarab/badge)](https://www.codefactor.io/repository/github/themrvx/sarab)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-C2185B.svg)](#license)
![Windows 10/11 x64](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
[![Rust CLI](https://img.shields.io/badge/CLI-Rust-orange?logo=rust&logoColor=white)](app/)
[![React + MUI](https://img.shields.io/badge/GUI-React%20%2B%20MUI-007FFF?logo=react&logoColor=white)](gui/)
[![UMDF 2.0 / C++](https://img.shields.io/badge/driver-UMDF%202.0%20%2F%20C%2B%2B-5C2D91?logo=windows&logoColor=white)](driver/)

[Features](#features) · [Getting started](#getting-started) · [Documentation](#documentation) · [Contributing](#contributing) · [Security](SECURITY.md) · [Releases](https://github.com/TheMRVX/sarab/releases)

</div>

---

## Overview

Sarab helps developers, testers, and researchers exercise location-aware Windows applications without physically moving the test computer. It offers a virtual sensor path and a simpler system-default-location path.

**Important limitations:** Sarab does **not** change a machine's public IP address or guarantee that every application will use the configured position. Applications may use Wi-Fi, network, cached, independent, or remote location signals. The project does not guarantee resistance to spoofing detection. Feature availability depends on the Windows build, driver state, and application behavior.

Use Sarab only on systems you own or are authorized to administer, and respect the rules of the software and services under test.

## Features

- **Virtual GNSS (advanced mode):** a UMDF 2.0 sensor driver supplies configured latitude, longitude, altitude, and accuracy through the Windows Location platform.
- **Simple mode:** updates the Windows system default location without installing the virtual driver; this is a fallback, not an equivalent replacement.
- **CLI and dashboard:** a Rust command-line tool and a locally served React / Material UI / Leaflet interface.
- **Route simulation:** import GPX tracks and replay movement. The optional "Snap to Roads" action sends route coordinates to an external OSRM-compatible routing service when invoked; that service may log them. Review the provider's terms and privacy practices before use; see [docs/LICENSING.md](docs/LICENSING.md#road-snapping-and-routing-osrm).
- **Diagnostics:** inspect driver status and query location values returned by the Windows location API.
- **Optional background service:** manage the local server with Windows Service Control Manager commands.

These describe implemented code paths, **not a certification of behavior on every Windows installation**. Read [limitations and troubleshooting](docs/USAGE.md#limitations-and-troubleshooting) before reporting unexpected results.

## Requirements and safety

- Windows 10 (1809 or later) or Windows 11, **x64**.
- Administrator privileges for driver installation, system-wide registry changes, and service administration.
- Advanced mode's **test-signed driver** requires Windows Test Signing to be active. Enabling it can require disabling Secure Boot and restarting Windows.
- **Before changing Secure Boot or boot settings, back up the BitLocker/device-encryption recovery key.** These changes can trigger recovery and weaken system protections. Use an isolated test machine or VM where possible.
- Release driver packages use **test certificates**, not production-trusted driver signing. Do not treat a passing CI build or test signature as evidence of Microsoft production certification.

### Choose a mode

| | Advanced virtual GNSS | Simple default location |
| --- | --- | --- |
| Windows source | UMDF 2.0 virtual sensor | `lfsvc` default-location registry values |
| Driver installation | Required | Not required |
| Test Signing | Required for supplied test-signed driver | Not required |
| Reliability | Depends on location service and application | May be ignored when another provider is available |
| CLI entry point | `driver install`, `set`, `enable` | `simple` |

## Getting started

1. Download the latest available archive or installer from [GitHub Releases](https://github.com/TheMRVX/sarab/releases). Check the specific release's notes, assets, and SHA256 checksums:
   - **Windows Installer (`SarabSetup-vX.Y.Z.exe`)**: Elevated system-wide setup (`%ProgramFiles%\Sarab`). Includes the **Add Sarab to PATH** task (checked by default) and creates Start Menu shortcuts, including **Sarab Command Prompt**. Terminals already open before installation do not receive the updated PATH automatically; open a fresh terminal window after installation to inherit the updated system PATH.
   - **Portable ZIP (`sarab-vX.Y.Z-x64.zip`)**: Standalone archive. Extract anywhere and execute directly from its directory (`.\sarab.exe`) without modifying system PATH or registering shortcuts.
2. On an authorized Windows test machine, open an elevated terminal. For advanced mode, review [driver installation and Test Signing](docs/INSTALLATION.md) **before** changing firmware or boot configuration.
3. With a driver installed and running, configure a test fix:

   ```powershell
   # If Sarab was installed with PATH enabled (fresh terminal):
   sarab set --lat 35.6997 --lon 51.3380 --alt 1200 --acc 5
   sarab enable
   sarab status
   sarab read

   # Or when running from the executable directory (portable ZIP or PATH disabled):
   .\sarab.exe set --lat 35.6997 --lon 51.3380 --alt 1200 --acc 5
   .\sarab.exe enable
   .\sarab.exe status
   .\sarab.exe read

   # Or using the full quoted path:
   # In PowerShell (call operator &):
   & "$env:ProgramFiles\Sarab\sarab.exe" status
   # In Command Prompt:
   "%ProgramFiles%\Sarab\sarab.exe" status
   ```

   For a no-driver fallback instead, run:

   ```powershell
   sarab simple --lat 35.6997 --lon 51.3380
   # Or: .\sarab.exe simple --lat 35.6997 --lon 51.3380
   ```

4. To open the locally hosted dashboard:

   ```powershell
   sarab gui --open
   # Or: .\sarab.exe gui --open
   ```

   The default binding is `127.0.0.1:8090`. Avoid binding the control API to a publicly accessible network interface.

### If sarab is not recognized

The installer adds Sarab to the system PATH by default, but Command Prompt and PowerShell windows open before installation do not automatically receive the updated PATH.

Close the current terminal, open a new Command Prompt or PowerShell window, and run:

```cmd
sarab --version
```

If `sarab` is still not recognized, use one of these alternatives:

1. **Start Menu shortcut**: Open **Start Menu > Sarab Virtual GNSS > Sarab Command Prompt**.
2. **Run from the installation directory**:
   - In PowerShell:
     ```powershell
     cd "$env:ProgramFiles\Sarab"
     .\sarab.exe token --raw
     ```
   - In Command Prompt:
     ```cmd
     cd /d "%ProgramFiles%\Sarab"
     sarab.exe token --raw
     ```
3. **Run using the full installation path**:
   - In PowerShell:
     ```powershell
     & "$env:ProgramFiles\Sarab\sarab.exe" token --raw
     ```
   - In Command Prompt:
     ```cmd
     "%ProgramFiles%\Sarab\sarab.exe" token --raw
     ```

Custom installations should replace the path with their selected folder. The portable ZIP package does not modify PATH automatically.

Use `sarab --help` (or `.\sarab.exe --help`) as the authoritative interface for the build you downloaded. See [the CLI and route guide](docs/USAGE.md) and [installation notes](docs/INSTALLATION.md) for full commands, automation options, and diagnostics.

## Build from source

On Windows, install Rust (stable MSVC toolchain), Visual Studio 2022 C++ build tools, a compatible Windows SDK/WDK, Node.js, and npm.

```powershell
cd gui
npm ci
npm run build
cd ..\app
cargo fmt --check
cargo clippy --locked -- -D warnings
cargo test --locked
cargo build --release --locked
```

Build `driver/SarabGnss.vcxproj` as **Release / x64** with the Windows Driver Kit. Driver packaging and test signing are separate steps; see [BUILDING.md](docs/BUILDING.md). The embedded dashboard is compiled from `gui/dist` when building the Rust application.

## Project layout

| Path | Purpose |
| --- | --- |
| [`app/`](app/) | Rust CLI, local control server, route engine, and system integration |
| [`driver/`](driver/) | C++ UMDF 2.0 virtual GNSS driver and INF |
| [`gui/`](gui/) | React/TypeScript dashboard and production assets |
| [`installer/`](installer/) | Inno Setup Windows installer definition |
| [`scripts/`](scripts/) | Release helper tooling |
| [`.github/workflows/`](.github/workflows/) | CI and release automation |
| [`docs/`](docs/) | Installation, usage, development, and support documentation |

## Documentation

- [Installation, test certificates, and recovery](docs/INSTALLATION.md)
- [CLI commands, configuration, and troubleshooting](docs/USAGE.md)
- [Build, test, and development instructions](docs/BUILDING.md)
- [Documentation index](docs/README.md)
- [Contributing and pull-request guidelines](CONTRIBUTING.md)
- [Security policy](SECURITY.md) · [Support](SUPPORT.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- [Third-party notices](THIRD-PARTY-NOTICES.md)

## Contributing

Bug reports, documentation improvements, and focused pull requests are welcome. Search [existing issues](https://github.com/TheMRVX/sarab/issues) first, use an issue template where applicable, and read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code. **Do not report exploitable security issues in public issues**; follow [SECURITY.md](SECURITY.md).

## License

Sarab is offered under **[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE)**, at your option. Review [NOTICE](NOTICE) and [third-party software notices](THIRD-PARTY-NOTICES.md) for additional attribution requirements.

Unless explicitly stated otherwise, any contribution intentionally submitted for inclusion in Sarab by you, as defined in Apache-2.0, shall be dual licensed under MIT OR Apache-2.0, without any additional terms or conditions. This does not override separate contributor agreements or rights of third parties. See [docs/LICENSING.md](docs/LICENSING.md) for redistribution guidance.
