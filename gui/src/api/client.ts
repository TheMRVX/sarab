// SPDX-License-Identifier: MIT OR Apache-2.0
import { SpoofConfig, SystemStatus, LiveLocation, SatelliteInfo } from '../types';

export function getSessionToken(): string {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="sarab-token"]');
    return meta?.getAttribute('content') || '';
  }
  return '';
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('X-Sarab-Token')) {
    headers.set('X-Sarab-Token', token);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}

// Default initial config (Tehran Azadi Square)
const DEFAULT_CONFIG: SpoofConfig = {
  latitude: 35.6997,
  longitude: 51.338,
  altitude: 1200.0,
  accuracy: 5.0,
  enabled: true,
  driftEnabled: true,
  driftRadius: 1.2,
};

let memoryConfig: SpoofConfig = { ...DEFAULT_CONFIG };

export const api = {
  async getSpoofConfig(): Promise<SpoofConfig> {
    try {
      const res = await apiFetch('/api/config');
      if (res.ok) return await res.json();
    } catch {
      // Offline / standalone preview
    }
    return memoryConfig;
  },

  async applySpoofConfig(config: SpoofConfig): Promise<boolean> {
    memoryConfig = { ...config };
    try {
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async toggleSpoof(enabled: boolean): Promise<boolean> {
    memoryConfig.enabled = enabled;
    try {
      const res = await apiFetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const res = await apiFetch('/api/status');
      if (res.ok) return await res.json();
    } catch {}

    // Simulated status for dev/web preview
    return {
      testSigning: true,
      testSigningDetails: 'TESTSIGNING NOEXECUTE=OPTIN',
      locationPrivacy: true,
      locationPrivacyDetails: 'Allowed (System & User)',
      bitlocker: 'Suspended / OFF',
      driverInstalled: true,
      driverRunning: true,
    };
  },

  async queryLiveLocation(): Promise<LiveLocation> {
    try {
      const res = await apiFetch('/api/read');
      if (res.ok) return await res.json();
    } catch {}

    // Reflect current spoof config as live reported fix
    return {
      latitude: memoryConfig.latitude,
      longitude: memoryConfig.longitude,
      altitude: memoryConfig.altitude,
      accuracy: memoryConfig.accuracy,
      source: 'Satellite (GNSS / GPS)',
      timestamp: new Date().toISOString(),
    };
  },

  async getSatellites(): Promise<SatelliteInfo[]> {
    try {
      const res = await apiFetch('/api/satellites');
      if (res.ok) return await res.json();
    } catch {}
    // Fallback simulation
    return [
      { id: 1, prn: 1, constellation: 'GPS', elevation: 65, azimuth: 120, snr: 42.5, used: true },
      { id: 2, prn: 65, constellation: 'GLONASS', elevation: 48, azimuth: 230, snr: 39.0, used: true },
      { id: 3, prn: 2, constellation: 'Galileo', elevation: 32, azimuth: 45, snr: 35.2, used: true },
      { id: 4, prn: 6, constellation: 'BeiDou', elevation: 78, azimuth: 310, snr: 44.1, used: true },
    ];
  },
};
