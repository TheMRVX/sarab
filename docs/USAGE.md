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

### Optional road snapping

The dashboard's **Snap to Roads** feature is disabled by default. To enable it, configure an OSRM-compatible endpoint before starting Sarab:

```powershell
$env:SARAB_OSRM_BASE_URL = "https://your-authorized-osrm.example"
.\sarab.exe gui --open
```

For a locally hosted OSRM instance, an HTTP loopback endpoint is also accepted (for example, `http://127.0.0.1:5000`). Remote endpoints must use HTTPS. Restart Sarab after changing the environment variable.

When you click **Snap to Roads**, the dashboard asks for confirmation before sending all route waypoint coordinates to the configured provider. The provider may log those coordinates. Sarab identifies itself with an application-specific User-Agent and project Referer, and enforces a 1.1-second minimum between requests per process. This local limit does not coordinate traffic across installations.

If Sarab runs as a Windows service, a user-session environment variable is not inherited by an already-running service. Configure `SARAB_OSRM_BASE_URL` in the machine environment or the service's own environment, then restart the service. Changing the environment for your interactive PowerShell session only affects Sarab processes launched from that session.

Do not use a public OSRM demo server as a production dependency. The Project-OSRM demo wiki (last edited in 2020) describes reasonable non-commercial use, a one-request-per-second maximum, and no uptime/latency/data-update guarantees. The current FOSSGIS routing-server page says requests are saved in logs, requires an identifying User-Agent and (where applicable) Referer, prohibits scraping/heavy use, and requires attribution plus a link to improve the map; its full usage policy is in German. Review the current operator terms before configuring a shared demo endpoint. Sarab's 1.1-second throttle is per process, not global across installations. Prefer a self-hosted or explicitly authorized provider for distributed use. See [the licensing and hosted-services notes](LICENSING.md#road-snapping-and-routing-osrm).

## Dashboard and service

```powershell
.\sarab.exe gui --open
.\sarab.exe web --port 8090
.\sarab.exe token
.\sarab.exe service install --port 8090
.\sarab.exe service start
.\sarab.exe service status
.\sarab.exe service stop
.\sarab.exe service uninstall
```

By default, the dashboard binds to `127.0.0.1:8090`. The web dashboard is protected by local authentication with fail-closed CSPRNG tokens and HttpOnly session cookies. When launched via `sarab gui --open`, your browser opens with a token bootstrap parameter that establishes the session. If opened directly or in another browser tab, run `sarab token` to view the active session token and enter it into the dashboard unlock prompt. Map tiles are fetched on-demand from OpenStreetMap contributors; all application assets, fonts (@fontsource/roboto), and stylesheets (Leaflet CSS) are embedded locally.

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
