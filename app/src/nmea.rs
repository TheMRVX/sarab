//! NMEA 0183 protocol generator and multi-constellation satellite simulation for Sarab GNSS.
//! Supports standard sentences: RMC, GGA, GSA, GSV, VTG with standard XOR checksums.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Constellation {
    GPS,
    GLONASS,
    Galileo,
    BeiDou,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Satellite {
    pub prn: u32,
    pub constellation: Constellation,
    pub azimuth: u32,   // 0 - 359 degrees
    pub elevation: u32, // 0 - 90 degrees
    pub snr: u32,       // 0 - 99 dB-Hz
    pub used_in_fix: bool,
}

/// Calculate standard NMEA 0183 checksum (XOR of all bytes between '$' and '*')
pub fn calculate_checksum(sentence: &str) -> u8 {
    let payload = sentence
        .trim_start_matches('$')
        .split('*')
        .next()
        .unwrap_or("");
    payload.bytes().fold(0u8, |acc, b| acc ^ b)
}

/// Format decimal degrees into NMEA latitude format: ddmm.mmmm and N/S indicator
pub fn format_nmea_latitude(lat: f64) -> (String, &'static str) {
    let dir = if lat >= 0.0 { "N" } else { "S" };
    let abs_lat = lat.abs();
    let degrees = abs_lat.floor() as u32;
    let minutes = (abs_lat - degrees as f64) * 60.0;
    (format!("{:02}{:07.4}", degrees, minutes), dir)
}

/// Format decimal degrees into NMEA longitude format: dddmm.mmmm and E/W indicator
pub fn format_nmea_longitude(lon: f64) -> (String, &'static str) {
    let dir = if lon >= 0.0 { "E" } else { "W" };
    let abs_lon = lon.abs();
    let degrees = abs_lon.floor() as u32;
    let minutes = (abs_lon - degrees as f64) * 60.0;
    (format!("{:03}{:07.4}", degrees, minutes), dir)
}

/// Formats UTC timestamp into hhmmss.ss
pub fn format_utc_time(epoch_secs: u64) -> String {
    let sec_in_day = epoch_secs % 86400;
    let h = sec_in_day / 3600;
    let m = (sec_in_day % 3600) / 60;
    let s = sec_in_day % 60;
    format!("{:02}{:02}{:02}.00", h, m, s)
}

/// Formats date into ddmmyy (defaulting to current mock date 121026 for 12-Oct-2026)
pub fn format_utc_date() -> &'static str {
    "121026"
}

/// Generate GPRMC (Recommended Minimum Specific GNSS Data)
pub fn generate_rmc(lat: f64, lon: f64, speed_kmh: f64, heading_deg: f64, epoch_secs: u64) -> String {
    let time_str = format_utc_time(epoch_secs);
    let (lat_str, lat_dir) = format_nmea_latitude(lat);
    let (lon_str, lon_dir) = format_nmea_longitude(lon);
    let speed_knots = speed_kmh / 1.852;
    let body = format!(
        "GPRMC,{},A,{},{},{},{},{:.2},{:.1},{},,,A",
        time_str, lat_str, lat_dir, lon_str, lon_dir, speed_knots, heading_deg, format_utc_date()
    );
    let cs = calculate_checksum(&body);
    format!("${}*{:02X}", body, cs)
}

/// Generate GPGGA (Global Positioning System Fix Data)
pub fn generate_gga(lat: f64, lon: f64, alt_m: f64, epoch_secs: u64, sat_count: usize) -> String {
    let time_str = format_utc_time(epoch_secs);
    let (lat_str, lat_dir) = format_nmea_latitude(lat);
    let (lon_str, lon_dir) = format_nmea_longitude(lon);
    let body = format!(
        "GPGGA,{},{},{},{},{},1,{:02},0.9,{:.1},M,0.0,M,,",
        time_str, lat_str, lat_dir, lon_str, lon_dir, sat_count.min(18), alt_m
    );
    let cs = calculate_checksum(&body);
    format!("${}*{:02X}", body, cs)
}

/// Generate GNGSA (Active Satellites & DOP across GNSS)
pub fn generate_gsa(sat_prns: &[u32]) -> String {
    let mut prn_fields = String::new();
    for i in 0..12 {
        if i < sat_prns.len() {
            prn_fields.push_str(&format!("{:02},", sat_prns[i]));
        } else {
            prn_fields.push(',');
        }
    }
    let body = format!("GNGSA,A,3,{}1.5,0.9,1.2", prn_fields);
    let cs = calculate_checksum(&body);
    format!("${}*{:02X}", body, cs)
}

/// Generate GPVTG (Course Over Ground and Ground Speed)
pub fn generate_vtg(heading_deg: f64, speed_kmh: f64) -> String {
    let speed_knots = speed_kmh / 1.852;
    let body = format!(
        "GPVTG,{:.1},T,,M,{:.2},N,{:.2},K,A",
        heading_deg, speed_knots, speed_kmh
    );
    let cs = calculate_checksum(&body);
    format!("${}*{:02X}", body, cs)
}

/// Generate GPGSV / GLGSV / GAGSV / GBGSV sentences for satellites in view
pub fn generate_gsv_sentences(satellites: &[Satellite]) -> Vec<String> {
    let mut sentences = Vec::new();
    let constellations = [
        (Constellation::GPS, "GPGSV"),
        (Constellation::GLONASS, "GLGSV"),
        (Constellation::Galileo, "GAGSV"),
        (Constellation::BeiDou, "GBGSV"),
    ];

    for (c, talker) in constellations {
        let sats: Vec<&Satellite> = satellites.iter().filter(|s| s.constellation == c).collect();
        if sats.is_empty() {
            continue;
        }
        let total_msgs = (sats.len() + 3) / 4;
        for (msg_idx, chunk) in sats.chunks(4).enumerate() {
            let mut body = format!("{},{},{},{}", talker, total_msgs, msg_idx + 1, sats.len());
            for sat in chunk {
                body.push_str(&format!(
                    ",{prn:02},{elev:02},{azim:03},{snr:02}",
                    prn = sat.prn,
                    elev = sat.elevation,
                    azim = sat.azimuth,
                    snr = sat.snr
                ));
            }
            let cs = calculate_checksum(&body);
            sentences.push(format!("${}*{:02X}", body, cs));
        }
    }

    sentences
}

/// Produce a realistic multi-constellation satellite constellation based on current fix coordinates and time
pub fn generate_mock_constellation(lat: f64, lon: f64, epoch_secs: u64) -> Vec<Satellite> {
    let mut sats = Vec::new();

    // 8 GPS Satellites
    let gps_prns = [1, 3, 7, 8, 11, 14, 17, 21];
    for (i, &prn) in gps_prns.iter().enumerate() {
        let offset = (i as f64 * 45.0 + (epoch_secs as f64 * 0.1) + lon) % 360.0;
        let azim = ((offset + 360.0) % 360.0) as u32;
        let elev = (15 + ((i * 11 + (lat.abs() as usize * 3)) % 72)) as u32;
        let snr = 30 + ((i * 5 + elev as usize / 2) % 18) as u32;
        sats.push(Satellite {
            prn,
            constellation: Constellation::GPS,
            azimuth: azim,
            elevation: elev.min(90),
            snr,
            used_in_fix: elev > 20,
        });
    }

    // 4 GLONASS Satellites
    let glo_prns = [65, 66, 71, 72];
    for (i, &prn) in glo_prns.iter().enumerate() {
        let offset = (i as f64 * 90.0 + 30.0 + (epoch_secs as f64 * 0.08)) % 360.0;
        let azim = ((offset + 360.0) % 360.0) as u32;
        let elev = (20 + (i * 17) % 65) as u32;
        let snr = 32 + ((i * 4) % 15) as u32;
        sats.push(Satellite {
            prn,
            constellation: Constellation::GLONASS,
            azimuth: azim,
            elevation: elev.min(90),
            snr,
            used_in_fix: elev > 25,
        });
    }

    // 4 Galileo Satellites
    let gal_prns = [2, 5, 12, 19];
    for (i, &prn) in gal_prns.iter().enumerate() {
        let offset = (i as f64 * 85.0 + 60.0 + (epoch_secs as f64 * 0.09)) % 360.0;
        let azim = ((offset + 360.0) % 360.0) as u32;
        let elev = (18 + (i * 19) % 70) as u32;
        let snr = 35 + ((i * 3) % 14) as u32;
        sats.push(Satellite {
            prn,
            constellation: Constellation::Galileo,
            azimuth: azim,
            elevation: elev.min(90),
            snr,
            used_in_fix: elev > 20,
        });
    }

    // 4 BeiDou Satellites
    let bds_prns = [6, 9, 16, 24];
    for (i, &prn) in bds_prns.iter().enumerate() {
        let offset = (i as f64 * 80.0 + 120.0 + (epoch_secs as f64 * 0.07)) % 360.0;
        let azim = ((offset + 360.0) % 360.0) as u32;
        let elev = (22 + (i * 15) % 68) as u32;
        let snr = 33 + ((i * 5) % 16) as u32;
        sats.push(Satellite {
            prn,
            constellation: Constellation::BeiDou,
            azimuth: azim,
            elevation: elev.min(90),
            snr,
            used_in_fix: elev > 20,
        });
    }

    sats
}

/// Produce a full bundle of NMEA 0183 sentences for the current epoch
pub fn generate_nmea_bundle(
    lat: f64,
    lon: f64,
    alt_m: f64,
    speed_kmh: f64,
    heading_deg: f64,
    epoch_secs: u64,
) -> (Vec<String>, Vec<Satellite>) {
    let satellites = generate_mock_constellation(lat, lon, epoch_secs);
    let active_prns: Vec<u32> = satellites
        .iter()
        .filter(|s| s.used_in_fix && s.constellation == Constellation::GPS)
        .map(|s| s.prn)
        .collect();

    let mut sentences = Vec::new();
    sentences.push(generate_rmc(lat, lon, speed_kmh, heading_deg, epoch_secs));
    sentences.push(generate_gga(lat, lon, alt_m, epoch_secs, active_prns.len()));
    sentences.push(generate_gsa(&active_prns));
    sentences.push(generate_vtg(heading_deg, speed_kmh));
    sentences.extend(generate_gsv_sentences(&satellites));

    (sentences, satellites)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_checksum() {
        // Known NMEA test: $GPRMC,081836,A,3751.65,S,14507.36,E,000.0,360.0,130998,011.3,E*62
        let sentence = "GPRMC,081836,A,3751.65,S,14507.36,E,000.0,360.0,130998,011.3,E";
        assert_eq!(calculate_checksum(sentence), 0x62);
    }

    #[test]
    fn test_format_nmea_lat_lon() {
        let (lat_str, lat_dir) = format_nmea_latitude(40.7580);
        assert_eq!(lat_str, "4045.4800");
        assert_eq!(lat_dir, "N");

        let (lon_str, lon_dir) = format_nmea_longitude(-73.9855);
        assert_eq!(lon_str, "07359.1300");
        assert_eq!(lon_dir, "W");
    }

    #[test]
    fn test_generate_bundle() {
        let (sentences, sats) = generate_nmea_bundle(40.7580, -73.9855, 10.0, 50.0, 30.0, 1700000000);
        assert!(!sentences.is_empty());
        assert!(sentences.iter().any(|s| s.starts_with("$GPRMC")));
        assert!(sentences.iter().any(|s| s.starts_with("$GPGGA")));
        assert!(sentences.iter().any(|s| s.starts_with("$GNGSA")));
        assert!(sentences.iter().any(|s| s.starts_with("$GPVTG")));
        assert!(sentences.iter().any(|s| s.starts_with("$GPGSV")));
        assert_eq!(sats.len(), 20); // 8 GPS + 4 GLONASS + 4 Galileo + 4 BeiDou
    }
}
