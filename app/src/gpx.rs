use anyhow::{anyhow, Result};
use quick_xml::events::{BytesStart, Event};
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

fn parse_lat_lon(
    attributes: quick_xml::events::attributes::Attributes,
) -> (Option<f64>, Option<f64>) {
    let mut lat = None;
    let mut lon = None;
    for attr in attributes.flatten() {
        if attr.key.as_ref() == b"lat" {
            if let Ok(val) = std::str::from_utf8(&attr.value) {
                lat = val.parse::<f64>().ok();
            }
        } else if attr.key.as_ref() == b"lon" {
            if let Ok(val) = std::str::from_utf8(&attr.value) {
                lon = val.parse::<f64>().ok();
            }
        }
    }
    (lat, lon)
}

fn compute_cumulative_distance(waypoints: &[Waypoint]) -> f64 {
    let mut total_distance_meters = 0.0;
    for i in 0..waypoints.len().saturating_sub(1) {
        let p1 = &waypoints[i];
        let p2 = &waypoints[i + 1];
        total_distance_meters += haversine_distance_meters(p1.lat, p1.lon, p2.lat, p2.lon);
    }
    total_distance_meters
}

#[derive(Default)]
struct GpxParserState {
    waypoints: Vec<Waypoint>,
    track_name: Option<String>,
    in_name_tag: bool,
    in_ele_tag: bool,
    in_time_tag: bool,
    in_point: bool,
    current_lat: Option<f64>,
    current_lon: Option<f64>,
    current_alt: Option<f64>,
    current_time: Option<String>,
}

impl GpxParserState {
    fn handle_start_tag(&mut self, e: &BytesStart) {
        match e.name().as_ref() {
            b"trkpt" | b"wpt" | b"rtept" => {
                self.in_point = true;
                let (lat, lon) = parse_lat_lon(e.attributes());
                self.current_lat = lat;
                self.current_lon = lon;
                self.current_alt = None;
                self.current_time = None;
            }
            b"ele" => {
                if self.in_point {
                    self.in_ele_tag = true;
                }
            }
            b"time" => {
                if self.in_point {
                    self.in_time_tag = true;
                }
            }
            b"name" if !self.in_point && self.track_name.is_none() => {
                self.in_name_tag = true;
            }
            _ => {}
        }
    }

    fn handle_text(&mut self, text: &str) {
        if self.in_ele_tag {
            self.current_alt = text.parse::<f64>().ok();
        } else if self.in_time_tag {
            self.current_time = Some(text.to_string());
        } else if self.in_name_tag {
            self.track_name = Some(text.to_string());
        }
    }

    fn handle_end_tag(&mut self, tag_name: &[u8]) {
        match tag_name {
            b"trkpt" | b"wpt" | b"rtept" => {
                if let (Some(lat), Some(lon)) = (self.current_lat, self.current_lon) {
                    self.waypoints.push(Waypoint {
                        lat,
                        lon,
                        alt: self.current_alt,
                        time: self.current_time.take(),
                    });
                }
                self.in_point = false;
            }
            b"ele" => self.in_ele_tag = false,
            b"time" => self.in_time_tag = false,
            b"name" => self.in_name_tag = false,
            _ => {}
        }
    }

    fn handle_empty_tag(&mut self, e: &BytesStart) {
        if matches!(e.name().as_ref(), b"trkpt" | b"wpt" | b"rtept") {
            let (lat, lon) = parse_lat_lon(e.attributes());
            if let (Some(lat_val), Some(lon_val)) = (lat, lon) {
                self.waypoints.push(Waypoint {
                    lat: lat_val,
                    lon: lon_val,
                    alt: None,
                    time: None,
                });
            }
        }
    }
}

/// Parses standard GPX 1.0 or 1.1 XML content into a structured Track.
pub fn parse_gpx(xml_content: &str) -> Result<Track> {
    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);

    let mut state = GpxParserState::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => state.handle_start_tag(e),
            Ok(Event::Text(ref e)) => state.handle_text(&e.unescape().unwrap_or_default()),
            Ok(Event::End(ref e)) => state.handle_end_tag(e.name().as_ref()),
            Ok(Event::Empty(ref e)) => state.handle_empty_tag(e),
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(anyhow!(
                    "GPX parse error at position {}: {:?}",
                    reader.buffer_position(),
                    e
                ))
            }
            _ => {}
        }
        buf.clear();
    }

    if state.waypoints.is_empty() {
        return Err(anyhow!("No valid GPS waypoints found in GPX content"));
    }

    let total_distance_meters = compute_cumulative_distance(&state.waypoints);

    Ok(Track {
        name: state.track_name,
        waypoints: state.waypoints,
        total_distance_meters,
    })
}

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Serializes waypoints to standard GPX 1.1 format.
#[allow(dead_code)]
pub fn export_to_gpx(track: &Track) -> String {
    let raw_name = track.name.as_deref().unwrap_or("Sarab Virtual Route");
    let name = xml_escape(raw_name);
    let mut gpx = String::new();
    gpx.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    gpx.push_str("<gpx version=\"1.1\" creator=\"Sarab Virtual GNSS Spoofer\"\n");
    gpx.push_str("     xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
    gpx.push_str(&format!("  <trk><name>{}</name><trkseg>\n", name));

    for wp in &track.waypoints {
        gpx.push_str(&format!(
            "    <trkpt lat=\"{:.7}\" lon=\"{:.7}\">\n",
            wp.lat, wp.lon
        ));
        if let Some(alt) = wp.alt {
            gpx.push_str(&format!("      <ele>{:.2}</ele>\n", alt));
        }
        if let Some(ref time) = wp.time {
            gpx.push_str(&format!("      <time>{}</time>\n", xml_escape(time)));
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
        assert_eq!(
            track.waypoints[0].time.as_deref(),
            Some("2026-10-12T07:00:00Z")
        );
        assert!(track.total_distance_meters > 50.0);
    }

    #[test]
    fn test_export_to_gpx() {
        let track = Track {
            name: Some("Test Route".to_string()),
            waypoints: vec![
                Waypoint {
                    lat: 40.7580,
                    lon: -73.9855,
                    alt: Some(10.0),
                    time: None,
                },
                Waypoint {
                    lat: 40.7590,
                    lon: -73.9845,
                    alt: Some(12.0),
                    time: None,
                },
            ],
            total_distance_meters: 150.0,
        };

        let xml = export_to_gpx(&track);
        assert!(xml.contains("<trkpt lat=\"40.7580000\" lon=\"-73.9855000\">"));
        assert!(xml.contains("<ele>10.00</ele>"));
    }

    #[test]
    fn test_parse_gpx_self_closing_tags() {
        let sample_self_closing = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RoutingEngine">
  <trk>
    <name>Route &amp; Track &lt;1&gt;</name>
    <trkseg>
      <trkpt lat="35.6997000" lon="51.3380000" />
      <trkpt lat="35.7005000" lon="51.3392000" />
    </trkseg>
  </trk>
</gpx>"#;

        let track = parse_gpx(sample_self_closing).expect("Should parse self-closing trkpt tags");
        assert_eq!(track.waypoints.len(), 2);
        assert!((track.waypoints[0].lat - 35.6997).abs() < 1e-6);
        assert!((track.waypoints[1].lat - 35.7005).abs() < 1e-6);

        let exported = export_to_gpx(&track);
        assert!(exported.contains("Route &amp; Track &lt;1&gt;"));
    }
}
