// SPDX-License-Identifier: MIT OR Apache-2.0
import { SpoofConfig, SystemStatus, LiveLocation, SatelliteInfo } from '../types';

let inMemoryToken: string | null = null;

export function isDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') return true;
    try {
      if (sessionStorage.getItem('sarab_demo') === 'true') return true;
    } catch {}
  }
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

export function setDemoMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        sessionStorage.setItem('sarab_demo', 'true');
      } else {
        sessionStorage.removeItem('sarab_demo');
      }
    } catch {}
  }
}

export function getSessionToken(): string {
  if (inMemoryToken) return inMemoryToken;

  if (typeof window !== 'undefined') {
    // 1. URL query parameter (?token=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryToken = urlParams.get('token');
      if (queryToken && queryToken.trim().length > 0) {
        inMemoryToken = queryToken.trim();
        try {
          sessionStorage.setItem('sarab_token', inMemoryToken);
        } catch {}
        return inMemoryToken;
      }
    } catch {}

    // 2. Meta tag injected by authenticated server
    try {
      const meta = document.querySelector('meta[name="sarab-token"]');
      const metaToken = meta?.getAttribute('content')?.trim();
      if (metaToken && metaToken.length > 0) {
        inMemoryToken = metaToken;
        try {
          sessionStorage.setItem('sarab_token', inMemoryToken);
        } catch {}
        return inMemoryToken;
      }
    } catch {}

    // 3. Stored in sessionStorage
    try {
      const stored = sessionStorage.getItem('sarab_token')?.trim();
      if (stored && stored.length > 0) {
        inMemoryToken = stored;
        return inMemoryToken;
      }
    } catch {}
  }

  return '';
}

export function setSessionToken(token: string): void {
  const clean = token.trim();
  inMemoryToken = clean;
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        sessionStorage.setItem('sarab_token', clean);
      } else {
        sessionStorage.removeItem('sarab_token');
      }
    } catch {}
  }
}

export async function checkAuthStatus(): Promise<boolean> {
  if (isDemoMode()) return true;
  try {
    const res = await apiFetch('/api/auth/status');
    if (res.ok) {
      const data = await res.json();
      return !!data.authenticated;
    }
  } catch {}
  return false;
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
    });
    if (res.ok) {
      setSessionToken(token);
      return true;
    }
  } catch {}
  return false;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('X-Sarab-Token')) {
    headers.set('X-Sarab-Token', token);
  }
  return fetch(input, {
    credentials: 'same-origin',
    ...init,
    headers,
  });
}

// Default fallback config (Tehran Azadi Square)
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
    if (isDemoMode()) {
      return memoryConfig;
    }
    const res = await apiFetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      memoryConfig = { ...cfg };
      return cfg;
    }
    throw new Error(`Failed to load config: HTTP ${res.status}`);
  },

  async applySpoofConfig(config: SpoofConfig): Promise<boolean> {
    memoryConfig = { ...config };
    if (isDemoMode()) {
      return true;
    }
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
    if (isDemoMode()) {
      return true;
    }
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
    if (isDemoMode()) {
      // Simulated status strictly in demo mode
      return {
        testSigning: true,
        testSigningDetails: 'TESTSIGNING NOEXECUTE=OPTIN (Demo)',
        locationPrivacy: true,
        locationPrivacyDetails: 'Allowed (System & User)',
        bitlocker: 'Suspended / OFF',
        driverInstalled: true,
        driverRunning: true,
      };
    }

    try {
      const res = await apiFetch('/api/status');
      if (res.ok) return await res.json();
    } catch {}

    // Truthful offline/disconnected status when backend is unavailable or unauthorized
    return {
      testSigning: false,
      testSigningDetails: 'Backend service offline or unauthorized',
      locationPrivacy: false,
      locationPrivacyDetails: 'Unknown',
      bitlocker: 'Unknown',
      driverInstalled: false,
      driverRunning: false,
    };
  },

  async queryLiveLocation(): Promise<LiveLocation | null> {
    if (isDemoMode()) {
      return {
        latitude: memoryConfig.latitude,
        longitude: memoryConfig.longitude,
        altitude: memoryConfig.altitude,
        accuracy: memoryConfig.accuracy,
        source: 'Satellite (GNSS / GPS) [Demo]',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const res = await apiFetch('/api/read');
      if (res.ok) return await res.json();
    } catch {}

    return null;
  },

  async getSatellites(): Promise<SatelliteInfo[]> {
    if (isDemoMode()) {
      return [
        { id: 1, prn: 1, constellation: 'GPS', elevation: 65, azimuth: 120, snr: 42.5, used: true },
        { id: 2, prn: 65, constellation: 'GLONASS', elevation: 48, azimuth: 230, snr: 39.0, used: true },
        { id: 3, prn: 2, constellation: 'Galileo', elevation: 32, azimuth: 45, snr: 35.2, used: true },
        { id: 4, prn: 6, constellation: 'BeiDou', elevation: 78, azimuth: 310, snr: 44.1, used: true },
      ];
    }

    try {
      const res = await apiFetch('/api/satellites');
      if (res.ok) return await res.json();
    } catch {}

    return [];
  },
};
