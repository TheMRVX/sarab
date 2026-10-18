//! NMEA UDP network broadcaster for Sarab GNSS.
//! Broadcasts standard NMEA 0183 sentences on UDP port 10110 (OpenCPN / marine GIS default).

use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Clone)]
pub struct NmeaBroadcaster {
    latest_sentences: Arc<Mutex<Vec<String>>>,
    is_running: Arc<AtomicBool>,
}

impl Default for NmeaBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

impl NmeaBroadcaster {
    pub fn new() -> Self {
        Self {
            latest_sentences: Arc::new(Mutex::new(Vec::new())),
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Update the current NMEA sentences to broadcast
    pub fn update_sentences(&self, sentences: Vec<String>) {
        if let Ok(mut lock) = self.latest_sentences.lock() {
            *lock = sentences;
        }
    }

    /// Get a snapshot of the latest sentences
    pub fn get_latest_sentences(&self) -> Vec<String> {
        self.latest_sentences
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    /// Start the autonomous background UDP broadcaster loop on port 10110
    pub fn start_udp_broadcast(
        &self,
        udp_port: u16,
        route_runner: crate::route_runner::RouteRunner,
    ) {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return; // already started
        }

        let sentences_arc = Arc::clone(&self.latest_sentences);
        let running_arc = Arc::clone(&self.is_running);

        thread::spawn(move || {
            let socket = match UdpSocket::bind("0.0.0.0:0") {
                Ok(s) => {
                    let _ = s.set_broadcast(true);
                    s
                }
                Err(e) => {
                    eprintln!("[NMEA Broadcaster] Failed to bind UDP socket: {}", e);
                    return;
                }
            };

            let broadcast_addr = format!("255.255.255.255:{}", udp_port);
            let localhost_addr = format!("127.0.0.1:{}", udp_port);

            while running_arc.load(Ordering::SeqCst) {
                // Fetch dynamic coordinates from active route or driver registry
                let (lat, lon, alt, speed_kmh, heading_deg) = {
                    let r_status = route_runner.get_status();
                    if r_status.is_running {
                        (
                            r_status.current_lat,
                            r_status.current_lon,
                            r_status.current_alt,
                            r_status.current_speed_kmh,
                            r_status.current_heading,
                        )
                    } else if let Ok(params) = crate::driver_comm::get_driver_parameters() {
                        (params.lat, params.lon, params.alt, 0.0, 0.0)
                    } else {
                        let cfg = crate::config::load_local_config();
                        (cfg.lat, cfg.lon, cfg.alt, 0.0, 0.0)
                    }
                };

                let epoch_secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(1700000000);

                let (bundle, _) = crate::nmea::generate_nmea_bundle(
                    lat,
                    lon,
                    alt,
                    speed_kmh,
                    heading_deg,
                    epoch_secs,
                );

                if let Ok(mut lock) = sentences_arc.lock() {
                    *lock = bundle.clone();
                }

                for line in &bundle {
                    let data = format!("{}\r\n", line);
                    let _ = socket.send_to(data.as_bytes(), &broadcast_addr);
                    let _ = socket.send_to(data.as_bytes(), &localhost_addr);
                }

                thread::sleep(Duration::from_millis(1000));
            }
        });
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}
