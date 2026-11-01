// SPDX-License-Identifier: MIT OR Apache-2.0
//! Urban Canyon Multipath and Tunnel Dead Reckoning Engine
//!
//! Models realistic GNSS signal degradation, multipath jitter, and inertial propagation
//! when line-of-sight satellite reception is obstructed (e.g. tunnels, underground parking, urban canyons).

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Operating environment mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvironmentMode {
    /// Clear line-of-sight sky reception (Standard / RTK)
    OpenSky = 0,
    /// Dense skyscraper reflections, multipath jitter, reduced SNR
    UrbanCanyon = 1,
    /// Complete satellite loss, pure inertial dead reckoning along heading vector
    Tunnel = 2,
    /// Underground parking: complete loss, zero velocity propagation
    Underground = 3,
}

impl EnvironmentMode {
    pub fn as_u32(&self) -> u32 {
        match self {
            EnvironmentMode::OpenSky => 0,
            EnvironmentMode::UrbanCanyon => 1,
            EnvironmentMode::Tunnel => 2,
            EnvironmentMode::Underground => 3,
        }
    }

    pub fn from_u32(val: u32) -> Self {
        match val {
            1 => EnvironmentMode::UrbanCanyon,
            2 => EnvironmentMode::Tunnel,
            3 => EnvironmentMode::Underground,
            _ => EnvironmentMode::OpenSky,
        }
    }
}

use std::sync::{Arc, Mutex, OnceLock};

static GLOBAL_ENGINE: OnceLock<Arc<Mutex<DeadReckoningEngine>>> = OnceLock::new();

pub fn get_engine() -> Arc<Mutex<DeadReckoningEngine>> {
    GLOBAL_ENGINE
        .get_or_init(|| Arc::new(Mutex::new(DeadReckoningEngine::new())))
        .clone()
}

/// Dead Reckoning and Multipath Engine state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeadReckoningState {
    pub mode: EnvironmentMode,
    pub is_active: bool,
    pub elapsed_seconds: f64,
    pub accumulated_error_meters: f64,
    pub satellites_visible: u32,
    pub hdop: f32,
    pub vdop: f32,
    pub current_accuracy_meters: f64,
}

/// Simulation engine for dead reckoning and urban multipath
pub struct DeadReckoningEngine {
    mode: EnvironmentMode,
    start_time: Option<Instant>,
    last_known_heading: f64,
    last_known_speed_mps: f64,
    initial_accuracy_meters: f64,
    error_growth_rate: f64, // meters per second error expansion (e.g. 0.4 m/s)
}

impl Default for DeadReckoningEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl DeadReckoningEngine {
    pub fn new() -> Self {
        Self {
            mode: EnvironmentMode::OpenSky,
            start_time: None,
            last_known_heading: 0.0,
            last_known_speed_mps: 0.0,
            initial_accuracy_meters: 1.0,
            error_growth_rate: 0.45,
        }
    }

    pub fn set_mode(&mut self, mode: EnvironmentMode) {
        if self.mode != mode {
            self.mode = mode;
            if mode == EnvironmentMode::Tunnel || mode == EnvironmentMode::Underground {
                self.start_time = Some(Instant::now());
            } else {
                self.start_time = None;
            }
        }
    }

    pub fn get_mode(&self) -> EnvironmentMode {
        self.mode
    }

    pub fn update_kinematics(&mut self, heading: f64, speed_mps: f64) {
        self.last_known_heading = heading;
        self.last_known_speed_mps = speed_mps;
    }

    /// Computes inertial propagation step during tunnel transit
    /// Returns (new_lat, new_lon, new_accuracy_meters)
    pub fn step_inertial_propagation(
        &mut self,
        current_lat: f64,
        current_lon: f64,
        delta_time_sec: f64,
    ) -> (f64, f64, f64) {
        match self.mode {
            EnvironmentMode::Tunnel => {
                // Distance traveled along heading vector: d = v * dt
                let dist_meters = self.last_known_speed_mps * delta_time_sec;
                let (new_lat, new_lon) = crate::kinematics::destination_point(
                    current_lat,
                    current_lon,
                    dist_meters,
                    self.last_known_heading,
                );

                // Error expands linearly with time: E(t) = E0 + alpha * t
                let elapsed = self
                    .start_time
                    .map(|t| t.elapsed().as_secs_f64())
                    .unwrap_or(0.0);
                let accuracy =
                    (self.initial_accuracy_meters + self.error_growth_rate * elapsed).min(100.0);

                (new_lat, new_lon, accuracy)
            }

            EnvironmentMode::UrbanCanyon => {
                // Multipath pseudo-random jitter (Gaussian approximation via Box-Muller or pseudo OU)
                let elapsed = Instant::now().elapsed().as_secs_f64();
                let jitter_north = (elapsed * 2.3).sin() * 3.5 + (elapsed * 5.7).cos() * 1.5;
                let jitter_east = (elapsed * 3.1).cos() * 3.2 + (elapsed * 7.1).sin() * 1.2;

                let r_earth = 6371000.0;
                let d_lat = (jitter_north / r_earth) * (180.0 / std::f64::consts::PI);
                let d_lon = (jitter_east / (r_earth * current_lat.to_radians().cos()))
                    * (180.0 / std::f64::consts::PI);

                (current_lat + d_lat, current_lon + d_lon, 12.0)
            }

            EnvironmentMode::Underground => {
                // Stationary with large uncertainty
                (current_lat, current_lon, 35.0)
            }

            EnvironmentMode::OpenSky => (current_lat, current_lon, 1.0),
        }
    }

    /// Query the current state of the engine
    pub fn query_state(&self) -> DeadReckoningState {
        let elapsed = self
            .start_time
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0);
        let accuracy = match self.mode {
            EnvironmentMode::OpenSky => 1.0,
            EnvironmentMode::UrbanCanyon => 12.0,
            EnvironmentMode::Tunnel => {
                (self.initial_accuracy_meters + self.error_growth_rate * elapsed).min(100.0)
            }
            EnvironmentMode::Underground => 35.0,
        };

        let sats = match self.mode {
            EnvironmentMode::OpenSky => 12,
            EnvironmentMode::UrbanCanyon => 5,
            EnvironmentMode::Tunnel => 0,
            EnvironmentMode::Underground => 0,
        };

        let (hdop, vdop) = match self.mode {
            EnvironmentMode::OpenSky => (0.6, 0.8),
            EnvironmentMode::UrbanCanyon => (2.8, 3.6),
            EnvironmentMode::Tunnel => (15.0, 22.0),
            EnvironmentMode::Underground => (25.0, 35.0),
        };

        DeadReckoningState {
            mode: self.mode,
            is_active: self.mode != EnvironmentMode::OpenSky,
            elapsed_seconds: elapsed,
            accumulated_error_meters: accuracy - 1.0,
            satellites_visible: sats,
            hdop,
            vdop,
            current_accuracy_meters: accuracy,
        }
    }
}

/// Applies the environment mode to the Windows driver registry parameters
#[cfg(windows)]
pub fn set_driver_environment_mode(mode: EnvironmentMode) -> Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE,
        REG_DWORD, REG_OPTION_NON_VOLATILE,
    };

    let subkey = HSTRING::from(crate::driver_comm::DRIVER_REG_PATH);
    let mut hkey: HKEY = Default::default();

    unsafe {
        let status = RegCreateKeyExW(
            HKEY_LOCAL_MACHINE,
            &subkey,
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        );
        if status.is_err() {
            return Err(anyhow::anyhow!(
                "Failed to open registry for EnvironmentMode: {:?}",
                status
            ));
        }

        let name = HSTRING::from("EnvironmentMode");
        let val: u32 = mode.as_u32();
        let bytes = val.to_ne_bytes();

        let res = RegSetValueExW(hkey, &name, 0, REG_DWORD, Some(&bytes));
        let _ = RegCloseKey(hkey);

        if res.is_err() {
            return Err(anyhow::anyhow!(
                "Failed to write EnvironmentMode registry value: {:?}",
                res
            ));
        }

        Ok(())
    }
}

#[cfg(not(windows))]
pub fn set_driver_environment_mode(_mode: EnvironmentMode) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_environment_mode_conversions() {
        assert_eq!(EnvironmentMode::OpenSky.as_u32(), 0);
        assert_eq!(EnvironmentMode::UrbanCanyon.as_u32(), 1);
        assert_eq!(EnvironmentMode::Tunnel.as_u32(), 2);
        assert_eq!(EnvironmentMode::Underground.as_u32(), 3);

        assert_eq!(EnvironmentMode::from_u32(0), EnvironmentMode::OpenSky);
        assert_eq!(EnvironmentMode::from_u32(1), EnvironmentMode::UrbanCanyon);
        assert_eq!(EnvironmentMode::from_u32(2), EnvironmentMode::Tunnel);
        assert_eq!(EnvironmentMode::from_u32(3), EnvironmentMode::Underground);
    }

    #[test]
    fn test_inertial_propagation_in_tunnel() {
        let mut engine = DeadReckoningEngine::new();
        engine.set_mode(EnvironmentMode::Tunnel);
        engine.update_kinematics(90.0, 20.0); // Heading East at 20 m/s (72 km/h)

        let start_lat = 40.7580;
        let start_lon = -73.9855;
        let (next_lat, next_lon, acc) = engine.step_inertial_propagation(start_lat, start_lon, 1.0);

        // Heading 90 deg -> East -> Lon increases
        assert!(next_lon > start_lon);
        // Lat should remain virtually unchanged
        assert!((next_lat - start_lat).abs() < 1e-4);
        assert!(acc >= 1.0);
    }

    #[test]
    fn test_urban_canyon_jitter() {
        let mut engine = DeadReckoningEngine::new();
        engine.set_mode(EnvironmentMode::UrbanCanyon);

        let start_lat = 40.7580;
        let start_lon = -73.9855;
        let (jitter_lat, jitter_lon, acc) =
            engine.step_inertial_propagation(start_lat, start_lon, 1.0);

        assert!(acc >= 10.0);
        assert!((jitter_lat - start_lat).abs() < 0.001);
        assert!((jitter_lon - start_lon).abs() < 0.001);
    }
}
