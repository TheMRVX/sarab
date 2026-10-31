// SPDX-License-Identifier: MIT OR Apache-2.0
pub const EARTH_RADIUS_METERS: f64 = 6_371_000.0;

/// Calculates great-circle distance between two coordinates in meters via Haversine formula.
pub fn haversine_distance_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let delta_phi = (lat2 - lat1).to_radians();
    let delta_lambda = (lon2 - lon1).to_radians();

    let a = (delta_phi / 2.0).sin().powi(2)
        + phi1.cos() * phi2.cos() * (delta_lambda / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS_METERS * c
}

/// Calculates initial bearing (forward azimuth) from point 1 to point 2 in degrees [0.0, 360.0).
pub fn initial_bearing(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let delta_lambda = (lon2 - lon1).to_radians();

    let y = delta_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * delta_lambda.cos();

    let theta_rad = y.atan2(x);
    let theta_deg = theta_rad.to_degrees();

    (theta_deg + 360.0) % 360.0
}

/// Interpolates position along a segment between point 1 and point 2 by fraction t (0.0 <= t <= 1.0).
pub fn interpolate_point(lat1: f64, lon1: f64, lat2: f64, lon2: f64, fraction: f64) -> (f64, f64) {
    let t = fraction.clamp(0.0, 1.0);
    let lat = lat1 + (lat2 - lat1) * t;
    let lon = lon1 + (lon2 - lon1) * t;
    (lat, lon)
}

/// Smoothly transitions heading towards target with a maximum angular rate limit.
pub fn smooth_bearing(
    current: f64,
    target: f64,
    max_turn_rate_deg_per_sec: f64,
    dt_sec: f64,
) -> f64 {
    let mut diff = (target - current + 180.0) % 360.0 - 180.0;
    if diff < -180.0 {
        diff += 360.0;
    }

    let max_step = max_turn_rate_deg_per_sec * dt_sec;
    let step = diff.clamp(-max_step, max_step);

    (current + step + 360.0) % 360.0
}

/// Computes realistic cornering speed (in m/s) based on vehicle deflection angle between segments.
pub fn cornering_speed_mps(
    base_speed_mps: f64,
    incoming_bearing: f64,
    outgoing_bearing: f64,
) -> f64 {
    let mut diff = (outgoing_bearing - incoming_bearing).abs() % 360.0;
    if diff > 180.0 {
        diff = 360.0 - diff;
    }

    // If deflection is minor (< 25 degrees), maintain full speed
    if diff <= 25.0 {
        return base_speed_mps;
    }

    // For sharp turns (up to 180 degrees), scale down to minimum 35% of base speed
    let factor = ((180.0 - diff) / 180.0).max(0.35);
    base_speed_mps * factor
}

/// Calculates destination point given starting point, distance (meters), and bearing (degrees).
pub fn destination_point(
    lat: f64,
    lon: f64,
    distance_meters: f64,
    bearing_degrees: f64,
) -> (f64, f64) {
    let delta = distance_meters / EARTH_RADIUS_METERS;
    let theta = bearing_degrees.to_radians();
    let phi1 = lat.to_radians();
    let lambda1 = lon.to_radians();

    let phi2 = (phi1.sin() * delta.cos() + phi1.cos() * delta.sin() * theta.cos()).asin();
    let lambda2 = lambda1
        + (theta.sin() * delta.sin() * phi1.cos()).atan2(delta.cos() - phi1.sin() * phi2.sin());

    (
        phi2.to_degrees(),
        (lambda2.to_degrees() + 540.0) % 360.0 - 180.0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_haversine_distance() {
        // Tehran Azadi (35.6997, 51.3380) to Milad Tower (35.7448, 51.3754) ~ 6.1 km
        let d = haversine_distance_meters(35.6997, 51.3380, 35.7448, 51.3754);
        assert!((d - 6120.0).abs() < 100.0);
    }

    #[test]
    fn test_initial_bearing() {
        // Due north
        let b_north = initial_bearing(0.0, 0.0, 1.0, 0.0);
        assert!((b_north - 0.0).abs() < 1e-4);

        // Due east
        let b_east = initial_bearing(0.0, 0.0, 0.0, 1.0);
        assert!((b_east - 90.0).abs() < 1e-4);

        // Due south
        let b_south = initial_bearing(1.0, 0.0, 0.0, 0.0);
        assert!((b_south - 180.0).abs() < 1e-4);

        // Due west
        let b_west = initial_bearing(0.0, 1.0, 0.0, 0.0);
        assert!((b_west - 270.0).abs() < 1e-4);
    }

    #[test]
    fn test_smooth_bearing() {
        // Target is 90 deg, current is 0 deg, max step 30 deg -> should reach 30 deg
        let s1 = smooth_bearing(0.0, 90.0, 30.0, 1.0);
        assert!((s1 - 30.0).abs() < 1e-4);

        // Wrap around 350 deg to 10 deg (shortest path is +20 deg)
        let s2 = smooth_bearing(350.0, 10.0, 30.0, 1.0);
        assert!((s2 - 10.0).abs() < 1e-4);
    }

    #[test]
    fn test_cornering_speed() {
        let base_speed = 20.0; // 72 km/h
                               // Straight line (diff 0)
        assert_eq!(cornering_speed_mps(base_speed, 90.0, 90.0), 20.0);

        // Sharp 90 degree turn -> should slow down
        let corner_speed = cornering_speed_mps(base_speed, 90.0, 180.0);
        assert!((7.0..20.0).contains(&corner_speed));
    }
}
