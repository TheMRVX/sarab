import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Divider,
  Snackbar,
  Alert,
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import HandymanIcon from '@mui/icons-material/Handyman';

import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { CoordinateForm } from './components/CoordinateForm';
import { PresetsSelector } from './components/PresetsSelector';
import { RouteSimulator } from './components/RouteSimulator';
import { SatelliteCard } from './components/SatelliteCard';
import { DriverSetupCard } from './components/DriverSetupCard';
import { DriftControlCard } from './components/DriftControlCard';
import { StatusBar } from './components/StatusBar';

import { api } from './api/client';
import {
  SpoofConfig,
  SystemStatus,
  LiveLocation,
  SatelliteInfo,
  Waypoint,
  PresetLocation,
} from './types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`sarab-tabpanel-${index}`}
      sx={{
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
        gap: 2.5,
        height: '100%',
      }}
    >
      {value === index && children}
    </Box>
  );
};

export const App: React.FC = () => {
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [config, setConfig] = useState<SpoofConfig>({
    latitude: 35.6997,
    longitude: 51.338,
    altitude: 1200.0,
    accuracy: 5.0,
    enabled: true,
    driftEnabled: true,
    driftRadius: 1.2,
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [liveFix, setLiveFix] = useState<LiveLocation | null>(null);
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'info' | 'warning' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showNotification = (
    message: string,
    severity: 'success' | 'info' | 'warning' | 'error' = 'info'
  ) => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification((prev) => ({ ...prev, open: false }));
  };

  // Initial load
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfg, status, fix, sats] = await Promise.all([
        api.getSpoofConfig(),
        api.getSystemStatus(),
        api.queryLiveLocation(),
        api.getSatellites(),
      ]);
      setConfig(cfg);
      setSystemStatus(status);
      setLiveFix(fix);
      setSatellites(sats);
    } catch (e) {
      console.error('Failed to load initial data:', e);
      showNotification('Failed to connect to Sarab backend service', 'warning');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle map coordinate clicks
  const handleMapCoordinateChange = (lat: number, lon: number) => {
    setConfig((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lon,
    }));
  };

  // Handle apply from CoordinateForm
  const handleApplyConfig = async (newConfig: SpoofConfig) => {
    setIsLoading(true);
    try {
      const ok = await api.applySpoofConfig(newConfig);
      if (ok) {
        setConfig(newConfig);
        showNotification(
          `Location updated: ${newConfig.latitude.toFixed(5)}, ${newConfig.longitude.toFixed(5)}`,
          'success'
        );
        // Refresh live fix
        const fix = await api.queryLiveLocation();
        setLiveFix(fix);
      } else {
        showNotification('Failed to push coordinates to driver', 'error');
      }
    } catch {
      showNotification('Communication error with Sarab backend', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle toggle spoof
  const handleToggleSpoof = async (enabled: boolean) => {
    try {
      const ok = await api.toggleSpoof(enabled);
      if (ok) {
        setConfig((prev) => ({ ...prev, enabled }));
        showNotification(
          enabled ? 'Virtual GNSS Spoofing Active' : 'Virtual GNSS Suspended',
          enabled ? 'success' : 'info'
        );
      }
    } catch {
      showNotification('Failed to toggle spoof status', 'error');
    }
  };

  // Handle preset selection
  const handleSelectPreset = async (preset: PresetLocation) => {
    const newConfig: SpoofConfig = {
      latitude: preset.lat,
      longitude: preset.lon,
      altitude: preset.alt,
      accuracy: preset.acc,
      enabled: config.enabled,
      driftEnabled: config.driftEnabled,
      driftRadius: config.driftRadius,
    };
    await handleApplyConfig(newConfig);
  };

  // Handle drift toggle
  const handleToggleDrift = async (enabled: boolean) => {
    const updated: SpoofConfig = { ...config, driftEnabled: enabled };
    setConfig(updated);
    try {
      const ok = await api.applySpoofConfig(updated);
      if (ok) {
        showNotification(
          enabled ? 'Gauss-Markov GPS Drift & Jitter activated' : 'GPS Drift suspended (Static fix)',
          'info'
        );
      } else {
        showNotification('Failed to update drift configuration', 'error');
      }
    } catch {
      showNotification('Failed to update drift configuration', 'error');
    }
  };

  // Handle drift radius change
  const handleChangeDriftRadius = async (radius: number) => {
    const updated: SpoofConfig = { ...config, driftRadius: radius };
    setConfig(updated);
    try {
      await api.applySpoofConfig(updated);
    } catch {
      showNotification('Failed to update drift radius', 'error');
    }
  };

  // Handle live WinRT query
  const handleQueryFix = async () => {
    setIsQuerying(true);
    try {
      const fix = await api.queryLiveLocation();
      setLiveFix(fix);
      showNotification(
        `WinRT Reported Fix: ${fix.latitude.toFixed(5)}°, ${fix.longitude.toFixed(5)}° (${fix.source})`,
        'success'
      );
    } catch {
      showNotification('Failed to query WinRT Windows.Devices.Geolocation', 'error');
    } finally {
      setIsQuerying(false);
    }
  };

  // Handle route simulation coordinates update
  const handleRouteUpdateCoordinates = (lat: number, lon: number) => {
    const updated: SpoofConfig = {
      ...config,
      latitude: lat,
      longitude: lon,
    };
    setConfig(updated);
    // Fire and forget update to driver
    api.applySpoofConfig(updated).catch(() => {});
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* Top Application Bar */}
      <Header
        spoofEnabled={config.enabled}
        onToggleSpoof={handleToggleSpoof}
        status={systemStatus}
        onRefresh={loadData}
      />

      {/* Main Workspace (Split Control Panel + Interactive Map) */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          flex: 1,
          minHeight: 0,
          position: 'relative',
        }}
      >
        {/* Left Control Panel */}
        <Box
          sx={{
            width: { xs: '100%', md: 440, lg: 480 },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            zIndex: 10,
            overflow: 'hidden',
          }}
        >
          {/* Navigation Tabs */}
          <Tabs
            value={tabIndex}
            onChange={(_, val) => setTabIndex(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              bgcolor: 'rgba(0, 0, 0, 0.2)',
              minHeight: 48,
              '& .MuiTab-root': {
                minHeight: 48,
                fontSize: '0.8rem',
                fontWeight: 600,
                textTransform: 'none',
                gap: 0.8,
              },
            }}
          >
            <Tab icon={<MyLocationIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Point" />
            <Tab icon={<AltRouteIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Route Sim" />
            <Tab icon={<SatelliteAltIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Constellation" />
            <Tab icon={<HandymanIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Driver & OS" />
          </Tabs>

          {/* Active Tab Panel Content */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2.5,
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 3,
              },
            }}
          >
            <TabPanel value={tabIndex} index={0}>
              <CoordinateForm
                config={config}
                onApply={handleApplyConfig}
                isLoading={isLoading}
              />
              <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.06)' }} />
              <DriftControlCard
                driftEnabled={config.driftEnabled ?? true}
                driftRadius={config.driftRadius ?? 1.2}
                onToggleDrift={handleToggleDrift}
                onChangeRadius={handleChangeDriftRadius}
              />
              <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.06)' }} />
              <PresetsSelector
                currentConfig={config}
                onSelectPreset={handleSelectPreset}
              />
            </TabPanel>

            <TabPanel value={tabIndex} index={1}>
              <RouteSimulator
                currentConfig={config}
                onUpdateCoordinates={handleRouteUpdateCoordinates}
                onWaypointsChange={setWaypoints}
              />
            </TabPanel>

            <TabPanel value={tabIndex} index={2}>
              <SatelliteCard satellites={satellites} />
            </TabPanel>

            <TabPanel value={tabIndex} index={3}>
              <DriverSetupCard
                status={systemStatus}
                onRefresh={loadData}
                isLoading={isLoading}
              />
            </TabPanel>
          </Box>
        </Box>

        {/* Right Map Canvas */}
        <Box
          sx={{
            flex: 1,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <MapView
            latitude={config.latitude}
            longitude={config.longitude}
            accuracy={config.accuracy}
            onCoordinateChange={handleMapCoordinateChange}
            waypoints={waypoints}
          />
        </Box>
      </Box>

      {/* Bottom Telemetry & Status Bar */}
      <StatusBar
        status={systemStatus}
        liveFix={liveFix}
        onQueryFix={handleQueryFix}
        isQuerying={isQuerying}
      />

      {/* Global Notifications Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%', boxShadow: 4 }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
