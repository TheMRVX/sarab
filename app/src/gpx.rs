use anyhow::{anyhow, Result};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};

use crate::kinematics::haversine_distance_meters;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Waypoint {
    pub lat: f64,
    pub lon: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub name: Option<String>,
    pub waypoints: Vec<Waypoint>,
    pub total_distance_meters: f64,
}

/// Parses standard GPX 1.0 or 1.1 XML content into a structured Track.
pub fn parse_gpx(xml_content: &str) -> Result<Track> {
    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);

    let mut waypoints = Vec::new();
    let mut track_name: Option<String> = None;

    let mut in_name_tag = false;
    let mut in_ele_tag = false;
    let mut in_time_tag = false;

    let mut current_lat: Option<f64> = None;
    let mut current_lon: Option<f64> = None;
    let mut current_alt: Option<f64> = None;
    let mut current_time: Option<String> = None;
    let mut in_point = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"trkpt" | b"wpt" | b"rtept" => {
                        in_point = true;
                        current_lat = None;
                        current_lon = None;
                        current_alt = None;
                        current_time = None;

                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"lat" {
                                if let Ok(val) = std::str::from_utf8(&attr.value) {
                                    current_lat = val.parse::<f64>().ok();
                                }
                            } else if attr.key.as_ref() == b"lon" {
                                if let Ok(val) = std::str::from_utf8(&attr.value) {
                                    current_lon = val.parse::<f64>().ok();
                                }
                            }
                        }
                    }
                    b"ele" => {
                        if in_point {
                            in_ele_tag = true;
                        }
                    }
                    b"time" => {
                        if in_point {
                            in_time_tag = true;
                        }
                    }
                    b"name" => {
                        if !in_point && track_name.is_none() {
                            in_name_tag = true;
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default();
                if in_ele_tag {
                    current_alt = text.parse::<f64>().ok();
                } else if in_time_tag {
                    current_time = Some(text.to_string());
                } else if in_name_tag {
                    track_name = Some(text.to_string());
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"trkpt" | b"wpt" | b"rtept" => {
                        if let (Some(lat), Some(lon)) = (current_lat, current_lon) {
                            waypoints.push(Waypoint {
                                lat,
                                lon,
                                alt: current_alt,
                                time: current_time.take(),
                            });
                        }
                        in_point = false;
                    }
                    b"ele" => in_ele_tag = false,
                    b"time" => in_time_tag = false,
                    b"name" => in_name_tag = false,
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(anyhow!("GPX parse error at position {}: {:?}", reader.buffer_position(), e)),
            _ => {}
        }
        buf.clear();
    }

    if waypoints.is_empty() {
        return Err(anyhow!("No valid GPS waypoints found in GPX content"));
    }

    // Compute cumulative track distance
    let mut total_distance_meters = 0.0;
    for i in 0..waypoints.len().saturating_sub(1) {
        let p1 = &waypoints[i];
        let p2 = &waypoints[i + 1];
        total_distance_meters += haversine_distance_meters(p1.lat, p1.lon, p2.lat, p2.lon);
    }

    Ok(Track {
        name: track_name,
        waypoints,
        total_distance_meters,
    })
}

/// Serializes waypoints to standard GPX 1.1 format.
pub fn export_to_gpx(track: &Track) -> String {
    let name = track.name.as_deref().unwrap_or("Sarab Virtual Route");
    let mut gpx = String::new();
    gpx.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    gpx.push_str("<gpx version=\"1.1\" creator=\"Sarab Virtual GNSS Spoofer\"\n");
    gpx.push_str("     xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
    gpx.push_str(&format!("  <trk><name>{}</name><trkseg>\n", name));

    for wp in &track.waypoints {
        gpx.push_str(&format!("    <trkpt lat=\"{:.7}\" lon=\"{:.7}\">\n", wp.lat, wp.lon));
        if let Some(alt) = wp.alt {
            gpx.push_str(&format!("      <ele>{:.2}</ele>\n", alt));
        }
        if let Some(ref time) = wp.time {
            gpx.push_str(&format!("      <time>{}</time>\n", time));
        }
        gpx.push_str("    </trkpt>\n");
    }

    gpx.push_str("  </trkseg></trk>\n</gpx>\n");
    gpx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_gpx() {
        let sample_gpx = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava">
  <trk>
    <name>Morning Run</name>
    <trkseg>
      <trkpt lat="35.6997000" lon="51.3380000">
        <ele>1200.5</ele>
        <time>2026-10-12T07:00:00Z</time>
      </trkpt>
      <trkpt lat="35.7005000" lon="51.3392000">
        <ele>1202.0</ele>
        <time>2026-10-12T07:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"#;

        let track = parse_gpx(sample_gpx).expect("Should parse sample GPX");
        assert_eq!(track.name.as_deref(), Some("Morning Run"));
        assert_eq!(track.waypoints.len(), 2);
        assert!((track.waypoints[0].lat - 35.6997).abs() < 1e-6);
        assert_eq!(track.waypoints[0].alt, Some(1200.5));
        assert_eq!(track.waypoints[0].time.as_deref(), Some("2026-10-12T07:00:00Z"));
        assert!(track.total_distance_meters > 50.0);
    }

    #[test]
    fn test_export_to_gpx() {
        let track = Track {
            name: Some("Test Route".to_string()),
            waypoints: vec![
                Waypoint { lat: 40.7580, lon: -73.9855, alt: Some(10.0), time: None },
                Waypoint { lat: 40.7590, lon: -73.9845, alt: Some(12.0), time: None },
            ],
            total_distance_meters: 150.0,
        };

        let xml = export_to_gpx(&track);
        assert!(xml.contains("<trkpt lat=\"40.7580000\" lon=\"-73.9855000\">"));
        assert!(xml.contains("<ele>10.00</ele>"));
    }
}
