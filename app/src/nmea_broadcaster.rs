//! NMEA UDP and TCP network broadcaster for Sarab GNSS.
//! Broadcasts standard NMEA 0183 sentences on UDP port 10110 (OpenCPN / marine GIS default)
//! and serves connected TCP clients on port 10111.

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

    /// Start the background UDP broadcaster loop on port 10110
    pub fn start_udp_broadcast(&self, udp_port: u16) {
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
                let lines = if let Ok(lock) = sentences_arc.lock() {
                    lock.clone()
                } else {
                    Vec::new()
                };

                for line in lines {
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
