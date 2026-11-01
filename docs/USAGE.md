# Usage and troubleshooting

Commands below match the CLI definitions in `app/src/cli.rs`. Check `sarab.exe <command> --help` for your installed version.

## Control a virtual location

Run from an elevated PowerShell terminal on an authorized test device with the driver installed:

```powershell
.\sarab.exe set --lat 35.6997 --lon 51.3380 --alt 1200 --acc 5
.\sarab.exe enable
.\sarab.exe status
.\sarab.exe status --json
.\sarab.exe read
.\sarab.exe read --json
.\sarab.exe disable
```

`set` accepts `--lat`, `--lon`, `--alt`, `--acc`, `--drift` and `--drift-radius`. Latitude must be in −90..90, longitude in −180..180, positive horizontal accuracy, and drift radius in 0..50 meters.

**Drift syntax:** the current Clap definition sets `--drift` as a boolean value rather than defining a `--no-drift` flag. For example:

```powershell
.\sarab.exe set --lat 35.6997 --lon 51.3380 --drift false
```

## Simulate a route

```powershell
.\sarab.exe route play --file "C:\tracks\sample.gpx" --speed 40
.\sarab.exe route status
.\sarab.exe route stop
```

The `route play` command requires `--file` and takes `--speed` (km/h) and optional `--loop-route` as defined in the current CLI. The `route status` and `route stop` commands talk to the local daemon (if running). The headless `route play` command runs in its own process; see the source for process lifecycle details.

## Dashboard and service

```powershell
.\sarab.exe gui --open
.\sarab.exe web --port 8090
.\sarab.exe service install --port 8090
.\sarab.exe service start
.\sarab.exe service status
.\sarab.exe service stop
.\sarab.exe service uninstall
```

By default, the dashboard binds to `127.0.0.1:8090`. The application includes local API authentication checks, but the control API was designed for local use; do not expose it to untrusted networks. Interactive route planning may make requests to an external OSRM endpoint, and map tiles are fetched from a third-party provider; avoid uploading sensitive route data without reviewing these dependencies.

## Configuration files

On Windows, with `ProgramData` defined, the code uses `%ProgramData%\Sarab\` for `config.toml`, `.session_token`, and `.port`. It falls back to `%APPDATA%\Sarab` or a temporary directory only if `ProgramData` is unavailable.

Example saved `config.toml`:

```toml
lat = 35.6997
lon = 51.3380
alt = 1200.0
acc = 5.0
enabled = true
drift_enabled = true
drift_radius = 1.2
```

Do **not** share `.session_token`; treat it as a credential. File ACLs and sensitive installation behavior should be verified on the actual target Windows machine.

## Limitations and troubleshooting

| Symptom | What to inspect |
| --- | --- |
| Driver install fails | Elevated terminal, correct INF/CAT/DLL/CER, matching x64 package, Windows driver status, Test Signing and Secure Boot policy |
| Location read returns no fix | Windows Location services, privacy settings, sensor status and application permissions |
| App shows another location | Cached position, Wi-Fi, IP/network-derived, independent or server-side location providers |
| Simple Mode does not override a position | Windows default-location fallback can lose to other location sources |
| Browser cannot reach dashboard | Local port, daemon/service status and loopback binding |
| Test Mode watermark | Expected on some systems while Test Signing is enabled |
| BitLocker recovery prompt | Use the recovery key secured before boot-policy changes |

Sarab does not change the computer's network location, public IP, browser fingerprint or service-side signals, and does not promise compatibility with all programs.

For installation and restoration guidance, see [INSTALLATION.md](INSTALLATION.md). For problems, follow [SUPPORT.md](../SUPPORT.md).
