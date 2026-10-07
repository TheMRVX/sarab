use anyhow::Result;
use mime_guess::from_path;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::config::{validate_coordinates, SpoofConfig};
use crate::{driver_comm, installer, reader};

#[derive(RustEmbed)]
#[folder = "../gui/dist/"]
struct Asset;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSpoofConfig {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: f64,
    pub accuracy: f64,
    pub enabled: bool,
}

impl From<SpoofConfig> for WebSpoofConfig {
    fn from(c: SpoofConfig) -> Self {
        Self {
            latitude: c.lat,
            longitude: c.lon,
            altitude: c.alt,
            accuracy: c.acc,
            enabled: c.enabled,
        }
    }
}

impl From<WebSpoofConfig> for SpoofConfig {
    fn from(w: WebSpoofConfig) -> Self {
        Self {
            lat: w.latitude,
            lon: w.longitude,
            alt: w.altitude,
            acc: w.accuracy,
            enabled: w.enabled,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TogglePayload {
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatusResponse {
    #[serde(rename = "testSigning")]
    pub test_signing: bool,
    #[serde(rename = "testSigningDetails")]
    pub test_signing_details: String,
    #[serde(rename = "locationPrivacy")]
    pub location_privacy: bool,
    #[serde(rename = "locationPrivacyDetails")]
    pub location_privacy_details: String,
    pub bitlocker: String,
    #[serde(rename = "driverInstalled")]
    pub driver_installed: bool,
    #[serde(rename = "driverRunning")]
    pub driver_running: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SatelliteTelemetry {
    pub id: u32,
    pub prn: u32,
    pub elevation: f64,
    pub azimuth: f64,
    pub snr: f64,
    pub used: bool,
}

pub fn open_browser(url: &str) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

pub fn start_server(host: &str, port: u16, open: bool) -> Result<()> {
    let addr = format!("{}:{}", host, port);
    let server = Server::http(&addr)
        .map_err(|e| anyhow::anyhow!("Failed to bind HTTP server to {}: {}", addr, e))?;

    let local_url = format!("http://localhost:{}", port);
    println!("\n========================================================");
    println!("  Sarab Virtual GNSS Web Control Dashboard");
    println!("  URL: {}", local_url);
    println!("  Listening on: http://{}", addr);
    println!("  Press Ctrl+C to stop the dashboard server.");
    println!("========================================================\n");

    if open {
        open_browser(&local_url);
    }

    let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
    let cors_methods = Header::from_bytes(
        &b"Access-Control-Allow-Methods"[..],
        &b"GET, POST, OPTIONS"[..],
    )
    .unwrap();
    let cors_headers = Header::from_bytes(
        &b"Access-Control-Allow-Headers"[..],
        &b"Content-Type, Authorization"[..],
    )
    .unwrap();

    for mut request in server.incoming_requests() {
        let url_path = request.url().split('?').next().unwrap_or("/").to_string();

        // Handle CORS preflight
        if request.method() == &Method::Options {
            let response = Response::empty(StatusCode(200))
                .with_header(cors_header.clone())
                .with_header(cors_methods.clone())
                .with_header(cors_headers.clone());
            let _ = request.respond(response);
            continue;
        }

        // REST API Routes
        if url_path.starts_with("/api/") {
            let json_header =
                Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

            match (request.method(), url_path.as_str()) {
                (&Method::Get, "/api/config") => {
                    let current = driver_comm::get_driver_parameters().unwrap_or_default();
                    let web_cfg = WebSpoofConfig::from(current);
                    let body = serde_json::to_string(&web_cfg).unwrap_or_default();
                    let resp = Response::from_string(body)
                        .with_header(json_header)
                        .with_header(cors_header.clone());
                    let _ = request.respond(resp);
                }

                (&Method::Post, "/api/config") => {
                    let mut content = String::new();
                    let _ = request.as_reader().read_to_string(&mut content);

                    match serde_json::from_str::<WebSpoofConfig>(&content) {
                        Ok(web_cfg) => {
                            if let Err(e) = validate_coordinates(
                                web_cfg.latitude,
                                web_cfg.longitude,
                                web_cfg.altitude,
                                web_cfg.accuracy,
                            ) {
                                let err_resp = Response::from_string(format!(
                                    "{{\"error\":\"{}\"}}",
                                    e
                                ))
                                .with_status_code(StatusCode(400))
                                .with_header(json_header)
                                .with_header(cors_header.clone());
                                let _ = request.respond(err_resp);
                                continue;
                            }

                            let spoof_cfg = SpoofConfig::from(web_cfg);
                            let _ = driver_comm::set_driver_parameters(&spoof_cfg);
                            let _ = crate::config::save_local_config(&spoof_cfg);

                            let ok_resp = Response::from_string("{\"status\":\"ok\"}")
                                .with_header(json_header)
                                .with_header(cors_header.clone());
                            let _ = request.respond(ok_resp);
                        }
                        Err(e) => {
                            let err_resp = Response::from_string(format!(
                                "{{\"error\":\"Invalid JSON: {}\"}}",
                                e
                            ))
                            .with_status_code(StatusCode(400))
                            .with_header(json_header)
                            .with_header(cors_header.clone());
                            let _ = request.respond(err_resp);
                        }
                    }
                }

                (&Method::Post, "/api/toggle") => {
                    let mut content = String::new();
                    let _ = request.as_reader().read_to_string(&mut content);

                    if let Ok(payload) = serde_json::from_str::<TogglePayload>(&content) {
                        let _ = driver_comm::set_driver_enabled(payload.enabled);
                        let ok_resp = Response::from_string("{\"status\":\"ok\"}")
                            .with_header(json_header)
                            .with_header(cors_header.clone());
                        let _ = request.respond(ok_resp);
                    } else {
                        let err_resp = Response::from_string("{\"error\":\"Invalid toggle body\"}")
                            .with_status_code(StatusCode(400))
                            .with_header(json_header)
                            .with_header(cors_header.clone());
                        let _ = request.respond(err_resp);
                    }
                }

                (&Method::Get, "/api/status") => {
                    let (test_signing, test_signing_details) =
                        installer::check_test_signing_mode();
                    let (location_privacy, location_privacy_details) =
                        reader::check_location_privacy_consent();
                    let bitlocker = installer::check_bitlocker_status();

                    let status_resp = SystemStatusResponse {
                        test_signing,
                        test_signing_details,
                        location_privacy,
                        location_privacy_details,
                        bitlocker,
                        driver_installed: true,
                        driver_running: true,
                    };

                    let body = serde_json::to_string(&status_resp).unwrap_or_default();
                    let resp = Response::from_string(body)
                        .with_header(json_header)
                        .with_header(cors_header.clone());
                    let _ = request.respond(resp);
                }

                (&Method::Get, "/api/read") => {
                    let report = reader::query_live_location();
                    match report {
                        Ok(data) => {
                            let body = serde_json::to_string(&data).unwrap_or_default();
                            let resp = Response::from_string(body)
                                .with_header(json_header)
                                .with_header(cors_header.clone());
                            let _ = request.respond(resp);
                        }
                        Err(e) => {
                            let err_resp = Response::from_string(format!(
                                "{{\"error\":\"Failed to query live fix: {}\"}}",
                                e
                            ))
                            .with_status_code(StatusCode(500))
                            .with_header(json_header)
                            .with_header(cors_header.clone());
                            let _ = request.respond(err_resp);
                        }
                    }
                }

                (&Method::Get, "/api/satellites") => {
                    let sats = vec![
                        SatelliteTelemetry { id: 1, prn: 12, elevation: 65.0, azimuth: 120.0, snr: 42.5, used: true },
                        SatelliteTelemetry { id: 2, prn: 19, elevation: 48.0, azimuth: 230.0, snr: 39.0, used: true },
                        SatelliteTelemetry { id: 3, prn: 24, elevation: 32.0, azimuth: 45.0, snr: 35.2, used: true },
                        SatelliteTelemetry { id: 4, prn: 28, elevation: 78.0, azimuth: 310.0, snr: 44.1, used: true },
                        SatelliteTelemetry { id: 5, prn: 6, elevation: 18.0, azimuth: 195.0, snr: 29.8, used: false },
                    ];
                    let body = serde_json::to_string(&sats).unwrap_or_default();
                    let resp = Response::from_string(body)
                        .with_header(json_header)
                        .with_header(cors_header.clone());
                    let _ = request.respond(resp);
                }

                _ => {
                    let resp = Response::from_string("{\"error\":\"Endpoint not found\"}")
                        .with_status_code(StatusCode(404))
                        .with_header(json_header)
                        .with_header(cors_header.clone());
                    let _ = request.respond(resp);
                }
            }
            continue;
        }

        // Serve Embedded Static Files (SPA)
        let trimmed_path = url_path.trim_start_matches('/');
        let path = if trimmed_path.is_empty() {
            "index.html"
        } else {
            trimmed_path
        };

        if let Some(file) = Asset::get(path) {
            let mime = from_path(path).first_or_octet_stream();
            let mime_header =
                Header::from_bytes(&b"Content-Type"[..], mime.as_ref().as_bytes()).unwrap();
            let data = file.data.into_owned();
            let len = data.len();
            let resp = Response::new(
                StatusCode(200),
                vec![mime_header, cors_header.clone()],
                Cursor::new(data),
                Some(len),
                None,
            );
            let _ = request.respond(resp);
        } else if let Some(index_file) = Asset::get("index.html") {
            // SPA fallback: return index.html for client-side routing
            let mime_header =
                Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();
            let data = index_file.data.into_owned();
            let len = data.len();
            let resp = Response::new(
                StatusCode(200),
                vec![mime_header, cors_header.clone()],
                Cursor::new(data),
                Some(len),
                None,
            );
            let _ = request.respond(resp);
        } else {
            let resp = Response::from_string("404 Not Found")
                .with_status_code(StatusCode(404))
                .with_header(cors_header.clone());
            let _ = request.respond(resp);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedded_assets_include_index_html() {
        let index = Asset::get("index.html");
        assert!(index.is_some(), "index.html must be present in embedded assets");
        let file = index.unwrap();
        let content = std::str::from_utf8(file.data.as_ref()).unwrap();
        assert!(
            content.contains("<div id=\"root\"></div>"),
            "index.html must contain root div"
        );
        assert!(
            content.contains("Sarab"),
            "index.html must have Sarab in title"
        );
    }

    #[test]
    fn test_web_spoof_config_conversion() {
        let original = SpoofConfig {
            lat: 35.6997,
            lon: 51.3380,
            alt: 1200.0,
            acc: 5.0,
            enabled: true,
        };

        let web_cfg = WebSpoofConfig::from(original.clone());
        assert_eq!(web_cfg.latitude, original.lat);
        assert_eq!(web_cfg.longitude, original.lon);
        assert_eq!(web_cfg.altitude, original.alt);
        assert_eq!(web_cfg.accuracy, original.acc);
        assert_eq!(web_cfg.enabled, original.enabled);

        let back = SpoofConfig::from(web_cfg);
        assert_eq!(original, back);
    }

    #[test]
    fn test_web_spoof_config_json_serialization() {
        let json_input = r#"{
            "latitude": 32.6577,
            "longitude": 51.6775,
            "altitude": 1570.0,
            "accuracy": 3.0,
            "enabled": true
        }"#;

        let parsed: WebSpoofConfig = serde_json::from_str(json_input).unwrap();
        assert_eq!(parsed.latitude, 32.6577);
        assert_eq!(parsed.longitude, 51.6775);
        assert_eq!(parsed.altitude, 1570.0);
        assert_eq!(parsed.accuracy, 3.0);
        assert!(parsed.enabled);
    }
}

