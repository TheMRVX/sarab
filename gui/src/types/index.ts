export interface SpoofConfig {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  enabled: boolean;
  driftEnabled: boolean;
  driftRadius: number; // in meters (e.g. 1.2)
}

export interface DriftPoint {
  x: number; // in meters (East)
  y: number; // in meters (North)
  timestamp: number;
}

export interface SystemStatus {
  testSigning: boolean;
  testSigningDetails: string;
  locationPrivacy: boolean;
  locationPrivacyDetails: string;
  bitlocker: string;
  driverInstalled: boolean;
  driverRunning: boolean;
  version?: string;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  source: string;
  timestamp?: string;
}

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
  alt?: number;
  name?: string;
}

export type RouteProfile = 'walking' | 'cycling' | 'driving' | 'highspeed';

export interface RouteSettings {
  profile: RouteProfile;
  speedKmh: number;
  loop: boolean;
  waypoints: Waypoint[];
}

export interface SatelliteInfo {
  id: number;
  prn: number;
  constellation?: string;
  elevation: number;
  azimuth: number;
  snr: number;
  used: boolean;
}

export interface PresetLocation {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  alt: number;
  acc: number;
}

export interface RouteStatus {
  is_running: boolean;
  is_paused: boolean;
  current_index: number;
  total_waypoints: number;
  progress_percent: number;
  current_lat: number;
  current_lon: number;
  current_alt: number;
  current_heading: number;
  current_speed_kmh: number;
  elapsed_seconds: number;
  is_looping: boolean;
  profile: 'driving' | 'cycling' | 'walking';
}

export interface GpxTrack {
  name?: string;
  waypoints: Array<{
    lat: number;
    lon: number;
    alt?: number;
    time?: string;
  }>;
  total_distance_meters: number;
}

