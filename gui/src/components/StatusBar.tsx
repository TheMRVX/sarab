import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Tooltip,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import SatelliteIcon from '@mui/icons-material/SatelliteAlt';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { LiveLocation, SystemStatus } from '../types';

interface StatusBarProps {
  status: SystemStatus | null;
  liveFix: LiveLocation | null;
  onQueryFix: () => Promise<void>;
  isQuerying?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  status,
  liveFix,
  onQueryFix,
  isQuerying = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!liveFix) return;
    const text = `${liveFix.latitude.toFixed(6)}, ${liveFix.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const isHealthy = status?.driverRunning && status?.testSigning && status?.locationPrivacy;

  return (
    <Paper
      elevation={3}
      sx={{
        py: 1.2,
        px: 2.5,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        bgcolor: 'background.paper',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        zIndex: 1000,
      }}
    >
      {/* Left: Live WinRT Location Report */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <SatelliteIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Live Fix Report:
          </Typography>
        </Box>

        {liveFix ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'Roboto Mono, monospace',
                fontWeight: 600,
                color: 'primary.light',
                bgcolor: 'rgba(0, 229, 255, 0.08)',
                px: 1,
                py: 0.2,
                borderRadius: 1,
              }}
            >
              {liveFix.latitude.toFixed(6)}°, {liveFix.longitude.toFixed(6)}°
            </Typography>

            <Tooltip title="Copy coordinates">
              <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Alt: <strong>{liveFix.altitude.toFixed(0)}m</strong>
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Acc: <strong>±{liveFix.accuracy.toFixed(1)}m</strong>
            </Typography>

            <Chip
              size="small"
              icon={<CheckCircleOutlineIcon sx={{ fontSize: '14px !important' }} />}
              label={liveFix.source}
              color="success"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }}
            />
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            No live reading queried yet.
          </Typography>
        )}
      </Box>

      {/* Right: Driver Status & Test Trigger Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={status?.testSigningDetails || 'System integrity check'}>
            <Chip
              size="small"
              icon={
                isHealthy ? (
                  <CheckCircleOutlineIcon sx={{ fontSize: '14px !important' }} />
                ) : (
                  <WarningAmberIcon sx={{ fontSize: '14px !important' }} />
                )
              }
              label={isHealthy ? 'Driver & OS Ready' : 'Check Requirements'}
              color={isHealthy ? 'success' : 'warning'}
              variant="filled"
              sx={{ height: 24, fontSize: '0.75rem', fontWeight: 600 }}
            />
          </Tooltip>
        </Box>

        <Button
          size="small"
          variant="outlined"
          color="primary"
          startIcon={
            isQuerying ? <CircularProgress size={14} color="inherit" /> : <PlayCircleOutlineIcon />
          }
          onClick={onQueryFix}
          disabled={isQuerying}
          sx={{
            textTransform: 'none',
            fontSize: '0.8rem',
            py: 0.4,
            px: 1.5,
            borderColor: 'rgba(0, 229, 255, 0.4)',
          }}
        >
          {isQuerying ? 'Querying WinRT...' : 'Verify WinRT Fix'}
        </Button>
      </Box>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          Coordinates copied to clipboard!
        </Alert>
      </Snackbar>
    </Paper>
  );
};
