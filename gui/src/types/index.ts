export interface SpoofConfig {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  enabled: boolean;
}

export interface SystemStatus {
  testSigning: boolean;
  testSigningDetails: string;
  locationPrivacy: boolean;
  locationPrivacyDetails: string;
  bitlocker: string;
  driverInstalled: boolean;
  driverRunning: boolean;
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
