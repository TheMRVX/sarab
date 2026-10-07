import { SpoofConfig, SystemStatus, LiveLocation, SatelliteInfo } from '../types';

// Check if running inside Tauri runtime
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Default initial config (Tehran Azadi Square)
const DEFAULT_CONFIG: SpoofConfig = {
  latitude: 35.6997,
  longitude: 51.338,
  altitude: 1200.0,
  accuracy: 5.0,
  enabled: true,
};

let memoryConfig: SpoofConfig = { ...DEFAULT_CONFIG };

export const api = {
  async getSpoofConfig(): Promise<SpoofConfig> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<SpoofConfig>('get_spoof_config');
      } catch (e) {
        console.warn('Tauri invoke failed, falling back to local state:', e);
      }
    }
    // Web REST or local fallback
    try {
      const res = await fetch('/api/config');
      if (res.ok) return await res.json();
    } catch {
      // Offline / standalone preview
    }
    return memoryConfig;
  },

  async applySpoofConfig(config: SpoofConfig): Promise<boolean> {
    memoryConfig = { ...config };
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('apply_spoof_config', { config });
      } catch (e) {
        console.warn('Tauri invoke failed:', e);
      }
    }
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return res.ok;
    } catch {
      return true;
    }
  },

  async toggleSpoof(enabled: boolean): Promise<boolean> {
    memoryConfig.enabled = enabled;
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('toggle_spoof', { enabled });
      } catch (e) {
        console.warn('Tauri invoke failed:', e);
      }
    }
    try {
      const res = await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      return res.ok;
    } catch {
      return true;
    }
  },

  async getSystemStatus(): Promise<SystemStatus> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<SystemStatus>('get_system_status');
      } catch (e) {
        console.warn('Tauri invoke failed:', e);
      }
    }
    try {
      const res = await fetch('/api/status');
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
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<LiveLocation>('query_live_location');
      } catch (e) {
        console.warn('Tauri invoke failed:', e);
      }
    }
    try {
      const res = await fetch('/api/read');
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
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<SatelliteInfo[]>('get_satellites');
      } catch {}
    }
    // Realistic satellite constellation simulation
    return [
      { id: 1, prn: 12, elevation: 65, azimuth: 120, snr: 42.5, used: true },
      { id: 2, prn: 19, elevation: 48, azimuth: 230, snr: 39.0, used: true },
      { id: 3, prn: 24, elevation: 32, azimuth: 45, snr: 35.2, used: true },
      { id: 4, prn: 28, elevation: 78, azimuth: 310, snr: 44.1, used: true },
      { id: 5, prn: 6, elevation: 18, azimuth: 195, snr: 29.8, used: false },
    ];
  },
};
