use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::driver_comm;
use crate::gpx::Waypoint;
use crate::kinematics::{
    cornering_speed_mps, haversine_distance_meters, initial_bearing, interpolate_point,
    smooth_bearing,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RouteProfile {
    Driving,
    Cycling,
    Walking,
}

impl Default for RouteProfile {
    fn default() -> Self {
        Self::Driving
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteStatus {
    pub is_running: bool,
    pub is_paused: bool,
    pub current_index: usize,
    pub total_waypoints: usize,
    pub progress_percent: f64,
    pub current_lat: f64,
    pub current_lon: f64,
    pub current_alt: f64,
    pub current_heading: f64,
    pub current_speed_kmh: f64,
    pub elapsed_seconds: u64,
    pub is_looping: bool,
    pub profile: RouteProfile,
}

struct RouteInternalState {
    waypoints: Vec<Waypoint>,
    current_index: usize,
    segment_progress: f64, // 0.0 .. 1.0
    speed_kmh: f64,
    current_heading: f64,
    current_lat: f64,
    current_lon: f64,
    current_alt: f64,
    is_running: bool,
    is_paused: bool,
    is_looping: bool,
    profile: RouteProfile,
    elapsed_seconds: u64,
}

#[derive(Clone)]
pub struct RouteRunner {
    state: Arc<RwLock<RouteInternalState>>,
    stop_signal: Arc<AtomicBool>,
}

impl Default for RouteRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl RouteRunner {
    pub fn new() -> Self {
        let initial_state = RouteInternalState {
            waypoints: Vec::new(),
            current_index: 0,
            segment_progress: 0.0,
            speed_kmh: 40.0,
            current_heading: 0.0,
            current_lat: 35.6997,
            current_lon: 51.3380,
            current_alt: 1200.0,
            is_running: false,
            is_paused: false,
            is_looping: false,
            profile: RouteProfile::Driving,
            elapsed_seconds: 0,
        };

        Self {
            state: Arc::new(RwLock::new(initial_state)),
            stop_signal: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(
        &self,
        waypoints: Vec<Waypoint>,
        speed_kmh: f64,
        is_looping: bool,
        profile: RouteProfile,
    ) -> Result<()> {
        if waypoints.len() < 2 {
            return Err(anyhow!("Route requires at least 2 waypoints"));
        }

        // Stop any currently running loop
        self.stop_signal.store(true, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(50));

        let initial_lat = waypoints[0].lat;
        let initial_lon = waypoints[0].lon;
        let initial_alt = waypoints[0].alt.unwrap_or(1200.0);
        let initial_heading = initial_bearing(
            waypoints[0].lat,
            waypoints[0].lon,
            waypoints[1].lat,
            waypoints[1].lon,
        );

        {
            let mut s = self.state.write().map_err(|e| anyhow!("Lock poison: {}", e))?;
            s.waypoints = waypoints;
            s.current_index = 0;
            s.segment_progress = 0.0;
            s.speed_kmh = speed_kmh.max(1.0);
            s.current_heading = initial_heading;
            s.current_lat = initial_lat;
            s.current_lon = initial_lon;
            s.current_alt = initial_alt;
            s.is_running = true;
            s.is_paused = false;
            s.is_looping = is_looping;
            s.profile = profile;
            s.elapsed_seconds = 0;
        }

        self.stop_signal.store(false, Ordering::SeqCst);

        // Spawn high-precision 1Hz background simulation worker
        let state_clone = Arc::clone(&self.state);
        let stop_clone = Arc::clone(&self.stop_signal);

        thread::spawn(move || {
            while !stop_clone.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(1000));

                if stop_clone.load(Ordering::SeqCst) {
                    break;
                }

                let mut s = match state_clone.write() {
                    Ok(guard) => guard,
                    Err(_) => break,
                };

                if !s.is_running || s.is_paused || s.waypoints.len() < 2 {
                    continue;
                }

                s.elapsed_seconds += 1;

                let idx = s.current_index;
                let next_idx = idx + 1;

                if next_idx >= s.waypoints.len() {
                    if s.is_looping {
                        s.current_index = 0;
                        s.segment_progress = 0.0;
                        continue;
                    } else {
                        s.is_running = false;
                        s.segment_progress = 1.0;
                        continue;
                    }
                }

                let p1 = s.waypoints[idx].clone();
                let p2 = s.waypoints[next_idx].clone();

                let dist_meters = haversine_distance_meters(p1.lat, p1.lon, p2.lat, p2.lon);
                let base_speed_mps = (s.speed_kmh * 1000.0) / 3600.0;

                // Determine target bearing for current segment
                let target_bearing = initial_bearing(p1.lat, p1.lon, p2.lat, p2.lon);

                // Check upcoming turn deflection if there is a next segment
                let effective_speed_mps = if next_idx + 1 < s.waypoints.len() {
                    let p3 = &s.waypoints[next_idx + 1];
                    let outgoing_bearing = initial_bearing(p2.lat, p2.lon, p3.lat, p3.lon);
                    cornering_speed_mps(base_speed_mps, target_bearing, outgoing_bearing)
                } else {
                    base_speed_mps
                };

                // Smooth angular heading transition (max 45 deg/sec turn rate)
                s.current_heading = smooth_bearing(s.current_heading, target_bearing, 45.0, 1.0);

                let distance_covered_step = effective_speed_mps * 1.0;
                let progress_increment = if dist_meters > 0.001 {
                    distance_covered_step / dist_meters
                } else {
                    1.0
                };

                s.segment_progress += progress_increment;

                if s.segment_progress >= 1.0 {
                    s.current_index += 1;
                    s.segment_progress = 0.0;
                    s.current_lat = p2.lat;
                    s.current_lon = p2.lon;
                    s.current_alt = p2.alt.unwrap_or(s.current_alt);
                } else {
                    let (lat, lon) = interpolate_point(p1.lat, p1.lon, p2.lat, p2.lon, s.segment_progress);
                    s.current_lat = lat;
                    s.current_lon = lon;

                    let alt1 = p1.alt.unwrap_or(s.current_alt);
                    let alt2 = p2.alt.unwrap_or(alt1);
                    s.current_alt = alt1 + (alt2 - alt1) * s.segment_progress;
                }

                // Update system driver registry parameters
                let _ = driver_comm::set_kinematics_parameters(
                    s.current_lat,
                    s.current_lon,
                    s.current_alt,
                    s.current_heading,
                    effective_speed_mps,
                );
            }
        });

        Ok(())
    }

    pub fn pause(&self) {
        if let Ok(mut s) = self.state.write() {
            s.is_paused = true;
        }
    }

    pub fn resume(&self) {
        if let Ok(mut s) = self.state.write() {
            s.is_paused = false;
        }
    }

    pub fn stop(&self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Ok(mut s) = self.state.write() {
            s.is_running = false;
            s.is_paused = false;
        }
    }

    pub fn get_status(&self) -> RouteStatus {
        let s = self.state.read().unwrap();
        let total_segments = s.waypoints.len().saturating_sub(1);
        let progress_percent = if total_segments > 0 {
            let overall = (s.current_index as f64 + s.segment_progress) / total_segments as f64 * 100.0;
            overall.clamp(0.0, 100.0)
        } else {
            0.0
        };

        RouteStatus {
            is_running: s.is_running,
            is_paused: s.is_paused,
            current_index: s.current_index,
            total_waypoints: s.waypoints.len(),
            progress_percent,
            current_lat: s.current_lat,
            current_lon: s.current_lon,
            current_alt: s.current_alt,
            current_heading: s.current_heading,
            current_speed_kmh: s.speed_kmh,
            elapsed_seconds: s.elapsed_seconds,
            is_looping: s.is_looping,
            profile: s.profile,
        }
    }
}
