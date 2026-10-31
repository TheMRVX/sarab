<div align="center">

# Sarab (سراب)

**Virtual GNSS location provider and testing toolkit for Windows**

Sarab supplies configurable coordinates to the Windows Location platform through a user-mode virtual GNSS driver. A Rust CLI and a local React dashboard manage location fixes and route simulations.

[![CI](https://github.com/TheMRVX/sarab/actions/workflows/ci.yml/badge.svg)](https://github.com/TheMRVX/sarab/actions/workflows/ci.yml)
[![MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue)](#license)
![Windows x64](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4)

[Features](#features) · [Getting started](#getting-started) · [Documentation](#documentation) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Releases](https://github.com/TheMRVX/sarab/releases)

</div>

## Overview

Sarab (*sarāb*, Persian for *mirage*) helps developers, testers and researchers exercise location-aware Windows applications without physically moving the test computer. It offers a virtual sensor path and a simpler system-default-location path.

**Important limitations:** Sarab does **not** change a machine's public IP address or guarantee that every application will use the configured position. Applications may use Wi-Fi, network, cached, independent or remote location signals. The project does not guarantee resistance to spoofing detection. Feature availability depends on the Windows build, driver state and application behavior.

Use Sarab only on systems you own or are authorized to administer, and respect the rules of the software and services under test.

## Features

- **Virtual GNSS (advanced mode):** a UMDF 2.0 sensor driver supplies configured latitude, longitude, altitude and accuracy through the Windows Location platform.
- **Simple mode:** updates the Windows system default location without installing the virtual driver; this is a fallback, not an equivalent replacement.
- **CLI and dashboard:** a Rust command-line tool and a locally served React / Material UI / Leaflet interface.
- **Route simulation:** import GPX tracks and replay movement; a road-routing planning feature can use an external OSRM service.
- **Diagnostics:** inspect driver status and query location values returned by the Windows location API.
- **Optional background service:** manage the local server with Windows Service Control Manager commands.

These describe implemented code paths, **not a certification of behavior on every Windows installation**. Read [limitations and troubleshooting](docs/USAGE.md#limitations-and-troubleshooting) before reporting unexpected results.

## Requirements and safety

- Windows 10 (1809 or later) or Windows 11, **x64**.
- Administrator privileges for driver installation, system-wide registry changes and service administration.
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

1. Download the latest available archive or installer from [GitHub Releases](https://github.com/TheMRVX/sarab/releases). Check the specific release's notes, assets and SHA256 checksums. **Do not assume every release contains the same artifacts.**
2. On an authorized Windows test machine, open an elevated terminal. For advanced mode, review [driver installation and Test Signing](docs/INSTALLATION.md) **before** changing firmware or boot configuration.
3. With a driver installed and running, configure a test fix:

   ```powershell
   .\sarab.exe set --lat 35.6997 --lon 51.3380 --alt 1200 --acc 5
   .\sarab.exe enable
   .\sarab.exe status
   .\sarab.exe read
   ```

   For a no-driver fallback instead, run:

   ```powershell
   .\sarab.exe simple --lat 35.6997 --lon 51.3380
   ```

4. To open the locally hosted dashboard:

   ```powershell
   .\sarab.exe gui --open
   ```

   The default binding is `127.0.0.1:8090`. Avoid binding the control API to a publicly accessible network interface.

Use `sarab.exe --help` and `sarab.exe <command> --help` as the authoritative interface for the build you downloaded. See [the CLI and route guide](docs/USAGE.md) for commands and diagnostics.

## Build from source

On Windows, install Rust (stable MSVC toolchain), Visual Studio 2022 C++ build tools, a compatible Windows SDK/WDK, Node.js and npm.

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
| [`app/`](app/) | Rust CLI, local control server, route engine and system integration |
| [`driver/`](driver/) | C++ UMDF 2.0 virtual GNSS driver and INF |
| [`gui/`](gui/) | React/TypeScript dashboard and production assets |
| [`installer/`](installer/) | Inno Setup Windows installer definition |
| [`scripts/`](scripts/) | Release helper tooling |
| [`.github/workflows/`](.github/workflows/) | CI and release automation |
| [`docs/`](docs/) | Installation, usage, development and support documentation |

## Documentation

- [Installation, test certificates and recovery](docs/INSTALLATION.md)
- [CLI commands, configuration and troubleshooting](docs/USAGE.md)
- [Build, test and development instructions](docs/BUILDING.md)
- [Documentation index](docs/README.md)
- [Contributing and pull-request guidelines](CONTRIBUTING.md)
- [Security policy](SECURITY.md) · [Support](SUPPORT.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- [Third-party notices](THIRD-PARTY-NOTICES.md)

## Contributing

Bug reports, documentation improvements and focused pull requests are welcome. Search [existing issues](https://github.com/TheMRVX/sarab/issues) first, use an issue template where applicable, and read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code. **Do not report exploitable security issues in public issues**; follow [SECURITY.md](SECURITY.md).

## License

Sarab is dual-licensed under **[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE)**, at your option. The two complete license texts are provided separately; see [licensing and redistribution](docs/LICENSING.md), [NOTICE](NOTICE), and [third-party notices](THIRD-PARTY-NOTICES.md).

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in Sarab by you, as defined in Apache-2.0, shall be dual-licensed under the same terms, without any additional terms or conditions.
