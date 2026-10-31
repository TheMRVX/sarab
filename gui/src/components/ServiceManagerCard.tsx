// SPDX-License-Identifier: MIT OR Apache-2.0
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import AddTaskIcon from '@mui/icons-material/AddTask';
import { apiFetch } from '../api/client';

interface ServiceStatus {
  supported: boolean;
  installed: boolean;
  running: boolean;
  state: string;
  service_name: string;
  display_name: string;
}

export const ServiceManagerCard: React.FC = () => {
  const [service, setService] = useState<ServiceStatus>({
    supported: true,
    installed: false,
    running: false,
    state: 'Checking...',
    service_name: 'SarabService',
    display_name: 'Sarab Virtual GNSS Service',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; severity: 'success' | 'error' | 'info' } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/service/status');
      if (res.ok) {
        const data = await res.json();
        setService(data);
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: 'install' | 'uninstall' | 'start' | 'stop') => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/service/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, port: 8090 }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setMsg({ text: `Service ${action} succeeded.`, severity: 'success' });
        await fetchStatus();
      } else {
        setMsg({ text: data.error || `Failed to ${action} service.`, severity: 'error' });
      }
    } catch (err: any) {
      setMsg({ text: err.message || 'Network request failed', severity: 'error' });
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
        bgcolor: 'rgba(255, 171, 0, 0.03)',
        borderColor: service.running ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 255, 255, 0.12)',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <MiscellaneousServicesIcon sx={{ color: service.running ? '#00e676' : 'warning.main', fontSize: 28 }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Windows Background Service Daemon
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Automatic Boot & Headless Session 0 Dispatcher
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            size="small"
            label={service.installed ? 'Installed' : 'Not Installed'}
            color={service.installed ? 'primary' : 'default'}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            size="small"
            label={service.running ? 'Running' : service.installed ? 'Stopped' : 'Disabled'}
            color={service.running ? 'success' : 'default'}
            variant={service.running ? 'filled' : 'outlined'}
            sx={{ fontWeight: 700 }}
          />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
        Runs Sarab continuously on Windows boot without keeping a terminal open. Spoons coordinates and feeds the Location API in the background.
      </Typography>

      {msg && (
        <Alert severity={msg.severity} sx={{ mb: 2, py: 0.5 }} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {!service.installed ? (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <AddTaskIcon />}
            disabled={loading || !service.supported}
            onClick={() => handleAction('install')}
            sx={{ fontWeight: 700 }}
          >
            Install Windows Service
          </Button>
        ) : (
          <>
            {!service.running ? (
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                disabled={loading}
                onClick={() => handleAction('start')}
                sx={{ fontWeight: 700 }}
              >
                Start Service
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <StopIcon />}
                disabled={loading}
                onClick={() => handleAction('stop')}
                sx={{ fontWeight: 700 }}
              >
                Stop Service
              </Button>
            )}
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteForeverIcon />}
              disabled={loading}
              onClick={() => handleAction('uninstall')}
            >
              Uninstall Service
            </Button>
          </>
        )}
      </Box>
    </Paper>
  );
};
