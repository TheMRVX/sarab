// SPDX-License-Identifier: MIT OR Apache-2.0
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Divider,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Typography,
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import HandymanIcon from '@mui/icons-material/Handyman';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { CoordinateForm } from './components/CoordinateForm';
import { PresetsSelector } from './components/PresetsSelector';
import { RouteSimulator } from './components/RouteSimulator';
import { SatelliteCard } from './components/SatelliteCard';
import { DriverSetupCard } from './components/DriverSetupCard';
import { DriftControlCard } from './components/DriftControlCard';
import { StatusBar } from './components/StatusBar';

import { api, checkAuthConnection, AuthConnectionState, verifyToken } from './api/client';
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
  const [backendState, setBackendState] = useState<AuthConnectionState | 'connecting'>('connecting');
  const [isConfigLoaded, setIsConfigLoaded] = useState<boolean>(false);
  const [, setIsAuthenticated] = useState<boolean>(false);
  const [authDialogOpen, setAuthDialogOpen] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
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

  // Initial load and refresh
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const authState = await checkAuthConnection();
      setBackendState(authState);

      if (authState === 'unreachable') {
        setIsAuthenticated(false);
        setSystemStatus(null);
        setLiveFix(null);
        setSatellites([]);
        setIsConfigLoaded(false);
        showNotification('Unable to connect to Sarab backend service at 127.0.0.1:8090', 'error');
        return;
      }

      if (authState === 'unauthenticated') {
        setIsAuthenticated(false);
        setSystemStatus(null);
        setLiveFix(null);
        setSatellites([]);
        setIsConfigLoaded(false);
        setAuthDialogOpen(true);
        return;
      }

      // authState === 'authenticated'
      setIsAuthenticated(true);
      setAuthDialogOpen(false);

      const [cfg, status, fix, sats] = await Promise.all([
        api.getSpoofConfig().catch(() => null),
        api.getSystemStatus().catch(() => null),
        api.queryLiveLocation().catch(() => null),
        api.getSatellites().catch(() => []),
      ]);

      if (cfg) {
        setConfig(cfg);
        setIsConfigLoaded(true);
      }
      setSystemStatus(status);
      setLiveFix(fix);
      setSatellites(sats);
    } catch (e) {
      console.error('Failed to load initial data:', e);
      setBackendState('unreachable');
      showNotification('Failed to communicate with Sarab backend service', 'warning');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleVerifyToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) {
      setAuthError('Please enter a session token.');
      return;
    }
    setIsVerifying(true);
    setAuthError('');
    try {
      const ok = await verifyToken(tokenInput.trim());
      if (ok) {
        setIsAuthenticated(true);
        setBackendState('authenticated');
        setAuthDialogOpen(false);
        setTokenInput('');
        showNotification('Dashboard unlocked successfully', 'success');
        await loadData();
      } else {
        setAuthError('Invalid or expired session token. Use one of the commands below to view the active token.');
      }
    } catch {
      setAuthError('Connection error while verifying token. Verify Sarab backend is running.');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle map coordinate clicks
  const handleMapCoordinateChange = (lat: number, lon: number) => {
    if (backendState !== 'authenticated') {
      showNotification('Unlock dashboard with session token before updating coordinates', 'warning');
      return;
    }
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
      if (fix) {
        showNotification(
          `WinRT Reported Fix: ${fix.latitude.toFixed(5)}°, ${fix.longitude.toFixed(5)}° (${fix.source})`,
          'success'
        );
      } else {
        showNotification('No active fix reported by Windows Location Service', 'info');
      }
    } catch {
      showNotification('Failed to query WinRT Windows.Devices.Geolocation', 'error');
    } finally {
      setIsQuerying(false);
    }
  };

  // Handle route simulation coordinates update
  const handleRouteUpdateCoordinates = (lat: number, lon: number) => {
    setConfig((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lon,
    }));
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
        backendState={backendState}
        isConfigLoaded={isConfigLoaded}
        isLoading={isLoading}
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
                disabled={backendState !== 'authenticated' || !isConfigLoaded}
              />
              <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.06)' }} />
              <DriftControlCard
                driftEnabled={config.driftEnabled ?? true}
                driftRadius={config.driftRadius ?? 1.2}
                onToggleDrift={handleToggleDrift}
                onChangeRadius={handleChangeDriftRadius}
                disabled={backendState !== 'authenticated' || !isConfigLoaded}
              />
              <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.06)' }} />
              <PresetsSelector
                currentConfig={config}
                onSelectPreset={handleSelectPreset}
                disabled={backendState !== 'authenticated' || !isConfigLoaded}
              />
            </TabPanel>

            <TabPanel value={tabIndex} index={1}>
              <RouteSimulator
                currentConfig={config}
                onUpdateCoordinates={handleRouteUpdateCoordinates}
                onWaypointsChange={setWaypoints}
                disabled={backendState !== 'authenticated' || !isConfigLoaded}
              />
            </TabPanel>

            <TabPanel value={tabIndex} index={2}>
              <SatelliteCard satellites={satellites} />
            </TabPanel>

            <TabPanel value={tabIndex} index={3}>
              <DriverSetupCard
                status={systemStatus}
                backendState={backendState}
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
        backendState={backendState}
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

      {/* Local Web Authentication Dialog */}
      <Dialog
        open={authDialogOpen}
        disableEscapeKeyDown
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            borderRadius: 3,
            p: 1,
            minWidth: { xs: '90%', sm: 500 },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <VpnKeyIcon color="primary" />
          Authentication Required
        </DialogTitle>
        <form onSubmit={handleVerifyToken}>
          <DialogContent sx={{ pt: 1 }}>
            <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
              Access to Sarab GNSS controls is protected. Enter the active session token to unlock this dashboard.
            </DialogContentText>

            <Box
              sx={{
                bgcolor: 'action.hover',
                p: 1.5,
                borderRadius: 1.5,
                mb: 2,
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Retrieve Active Token:
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  PATH (Default):
                </Typography>
                <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'primary.light' }}>
                  sarab token
                </Typography>
              </Box>

              <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)' }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Current Directory / Portable:
                </Typography>
                <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'primary.light' }}>
                  .\sarab.exe token
                </Typography>
              </Box>

              <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)' }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Full Path (PowerShell):
                </Typography>
                <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'primary.light' }}>
                  &amp; &quot;&lt;path&gt;\sarab.exe&quot; token
                </Typography>
              </Box>

              <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)' }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Start Menu:
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'secondary.light' }}>
                  Sarab Command Prompt
                </Typography>
              </Box>
            </Box>

            {authError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {authError}
              </Alert>
            )}
            <TextField
              autoFocus
              fullWidth
              size="medium"
              label="Session Token"
              variant="outlined"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                if (authError) setAuthError('');
              }}
              placeholder="Paste active session token..."
              disabled={isVerifying}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={loadData}
              disabled={isVerifying || isLoading}
            >
              Retry Connection
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isVerifying || !tokenInput.trim()}
              startIcon={isVerifying ? <CircularProgress size={18} /> : undefined}
            >
              {isVerifying ? 'Verifying...' : 'Unlock Dashboard'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};
