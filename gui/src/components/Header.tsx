import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Chip,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
} from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { SystemStatus } from '../types';

interface HeaderProps {
  spoofEnabled: boolean;
  onToggleSpoof: (enabled: boolean) => void;
  status: SystemStatus | null;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  spoofEnabled,
  onToggleSpoof,
  status,
  onRefresh,
}) => {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 1, sm: 2 } }}>
        {/* Brand & Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: '8px',
              bgcolor: 'rgba(0, 229, 255, 0.15)',
              color: 'primary.main',
              border: '1px solid rgba(0, 229, 255, 0.4)',
            }}
          >
            <GpsFixedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
              SARAB <Typography component="span" variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>v0.2.0-beta</Typography>
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
              Virtual GNSS Location Provider for Windows
            </Typography>
          </Box>
        </Box>

        {/* System Diagnostics Badges */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            icon={<VerifiedUserIcon />}
            label={status?.driverRunning ? 'Driver: Active' : 'Driver: Offline'}
            color={status?.driverRunning ? 'success' : 'error'}
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<SecurityIcon />}
            label={status?.testSigning ? 'Test Mode: ON' : 'Test Mode: OFF'}
            color={status?.testSigning ? 'success' : 'warning'}
            variant="outlined"
          />
          <Chip
            size="small"
            label="Source: Satellite"
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* Spoof Toggle & Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={spoofEnabled}
                onChange={(e) => onToggleSpoof(e.target.checked)}
                color="success"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 600, color: spoofEnabled ? 'success.main' : 'text.secondary' }}>
                {spoofEnabled ? 'SPOOFING ACTIVE' : 'SPOOFING DISABLED'}
              </Typography>
            }
            sx={{ m: 0 }}
          />

          <Tooltip title="Refresh State">
            <IconButton onClick={onRefresh} size="small" sx={{ color: 'text.secondary' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
