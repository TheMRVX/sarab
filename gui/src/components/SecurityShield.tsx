// SPDX-License-Identifier: MIT OR Apache-2.0
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Chip,
  CircularProgress,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import SecurityIcon from '@mui/icons-material/Security';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { apiFetch } from '../api/client';

interface ShieldStatus {
  rtk_shield_enabled: boolean;
  gnss_authority_percent: number;
  anti_rubberband_active: boolean;
  wifi_scanning_suppressed: boolean;
  details: string;
}

export const SecurityShield: React.FC = () => {
  const [shield, setShield] = useState<ShieldStatus>({
    rtk_shield_enabled: true,
    gnss_authority_percent: 100,
    anti_rubberband_active: true,
    wifi_scanning_suppressed: true,
    details: 'RTK Carrier-Phase simulation active (100% GNSS authority)',
  });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/shield/status');
      if (res.ok) {
        const data = await res.json();
        setShield(data);
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/shield/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked }),
      });
      if (res.ok) {
        setShield((prev) => ({
          ...prev,
          rtk_shield_enabled: checked,
          gnss_authority_percent: checked ? 100 : 85,
          anti_rubberband_active: checked,
          wifi_scanning_suppressed: checked,
        }));
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
        bgcolor: 'rgba(0, 229, 255, 0.03)',
        borderColor: shield.anti_rubberband_active ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 255, 255, 0.12)',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ShieldIcon sx={{ color: shield.anti_rubberband_active ? '#00e5ff' : 'text.secondary', fontSize: 28 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Location Authority & Wi-Fi Shield
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Anti-Rubberband BSSID Triangulation Defeat
            </Typography>
          </Box>
        </Box>
        <Chip
          size="small"
          icon={<SecurityIcon />}
          label={`${shield.gnss_authority_percent}% GNSS Sensor Authority`}
          color={shield.gnss_authority_percent === 100 ? 'success' : 'warning'}
          variant="outlined"
          sx={{ fontWeight: 700 }}
        />
      </Box>

      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
        Forces the Windows Geolocation Service to assign 100% confidence to the UMDF GNSS driver, completely overriding physical Wi-Fi AP BSSID triangulation jitter when Wi-Fi is turned on.
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.paper', p: 1.5, borderRadius: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WifiOffIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            RTK / DGPS Carrier-Phase Shield
          </Typography>
        </Box>
        <FormControlLabel
          control={
            loading ? (
              <CircularProgress size={20} sx={{ mr: 1 }} />
            ) : (
              <Switch
                checked={shield.rtk_shield_enabled}
                onChange={(e) => handleToggle(e.target.checked)}
                color="primary"
              />
            )
          }
          label={shield.rtk_shield_enabled ? 'Active' : 'Disabled'}
          sx={{ m: 0 }}
        />
      </Box>
    </Paper>
  );
};
