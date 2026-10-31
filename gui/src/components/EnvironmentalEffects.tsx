// SPDX-License-Identifier: MIT OR Apache-2.0
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  LinearProgress,
} from '@mui/material';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import DirectionsSubwayIcon from '@mui/icons-material/DirectionsSubway';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import { apiFetch } from '../api/client';

export type EnvironmentMode = 'open_sky' | 'urban_canyon' | 'tunnel' | 'underground';

interface EnvironmentStatus {
  mode: EnvironmentMode;
  is_active: boolean;
  elapsed_seconds: number;
  accumulated_error_meters: number;
  satellites_visible: number;
  hdop: number;
  vdop: number;
  current_accuracy_meters: number;
}

export const EnvironmentalEffects: React.FC = () => {
  const [status, setStatus] = useState<EnvironmentStatus>({
    mode: 'open_sky',
    is_active: false,
    elapsed_seconds: 0,
    accumulated_error_meters: 0,
    satellites_visible: 12,
    hdop: 0.6,
    vdop: 0.8,
    current_accuracy_meters: 1.0,
  });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/environment/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = async (
    _event: React.MouseEvent<HTMLElement>,
    newMode: EnvironmentMode | null
  ) => {
    if (!newMode || newMode === status.mode) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/environment/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mt: 2,
        bgcolor: 'rgba(156, 39, 176, 0.03)',
        borderColor: status.mode !== 'open_sky' ? 'rgba(156, 39, 176, 0.35)' : 'rgba(255, 255, 255, 0.12)',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SatelliteAltIcon sx={{ color: status.mode === 'tunnel' ? '#ff5252' : status.mode === 'urban_canyon' ? '#ffb74d' : '#ab47bc', fontSize: 28 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Urban Multipath & Tunnel Dead Reckoning
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Inertial Odometry, Skyscraper Multipath & Satellite Loss Simulation
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            size="small"
            label={`${status.satellites_visible} Sats Visible`}
            color={status.satellites_visible > 6 ? 'success' : status.satellites_visible > 0 ? 'warning' : 'error'}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            size="small"
            label={`HDOP ${status.hdop.toFixed(1)}`}
            color={status.hdop < 1.5 ? 'success' : status.hdop < 5 ? 'warning' : 'error'}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
        Select environment to test navigation app behavior under challenging signal conditions.
      </Typography>

      <ToggleButtonGroup
        value={status.mode}
        exclusive
        onChange={handleModeChange}
        size="small"
        fullWidth
        sx={{ mb: 2 }}
        disabled={loading}
      >
        <ToggleButton value="open_sky" sx={{ py: 1 }}>
          <WbSunnyIcon sx={{ mr: 1, fontSize: 18, color: '#ffb74d' }} />
          Open Sky
        </ToggleButton>
        <ToggleButton value="urban_canyon" sx={{ py: 1 }}>
          <LocationCityIcon sx={{ mr: 1, fontSize: 18, color: '#64b5f6' }} />
          Urban Canyon
        </ToggleButton>
        <ToggleButton value="tunnel" sx={{ py: 1 }}>
          <DirectionsSubwayIcon sx={{ mr: 1, fontSize: 18, color: '#e57373' }} />
          Tunnel (DR)
        </ToggleButton>
        <ToggleButton value="underground" sx={{ py: 1 }}>
          <LocalParkingIcon sx={{ mr: 1, fontSize: 18, color: '#ba68c8' }} />
          Underground
        </ToggleButton>
      </ToggleButtonGroup>

      {status.mode === 'tunnel' && (
        <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1.5, border: '1px solid rgba(229, 115, 115, 0.2)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
              Tunnel Dead Reckoning Inertial Propagation Active
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Accuracy Error Radius: ±{status.current_accuracy_meters.toFixed(1)}m
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (status.current_accuracy_meters / 50) * 100)}
            color="error"
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {status.mode === 'urban_canyon' && (
        <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1.5, border: '1px solid rgba(100, 181, 246, 0.2)' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'info.main', display: 'block' }}>
            Skyscraper Multipath Jitter & Signal Reflection
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            GNSS receiver tracking high-elevation satellites only. Pseudorange reflections induce ±12m scatter.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};
