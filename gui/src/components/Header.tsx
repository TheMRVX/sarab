// SPDX-License-Identifier: MIT OR Apache-2.0
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
import LockIcon from '@mui/icons-material/Lock';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CircularProgress from '@mui/material/CircularProgress';
import { SystemStatus } from '../types';
import { AuthConnectionState } from '../api/client';

interface HeaderProps {
  spoofEnabled: boolean;
  isConfigLoaded: boolean;
  onToggleSpoof: (enabled: boolean) => void;
  status: SystemStatus | null;
  backendState: AuthConnectionState | 'connecting';
  onRefresh: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  spoofEnabled,
  isConfigLoaded,
  onToggleSpoof,
  status,
  backendState,
  onRefresh,
  isLoading = false,
}) => {
  const getDriverBadge = () => {
    if (backendState === 'connecting' || (backendState === 'authenticated' && status === null)) {
      return {
        label: 'Driver: Checking...',
        color: 'default' as const,
        icon: <CircularProgress size={12} color="inherit" />,
      };
    }
    if (backendState === 'unauthenticated') {
      return {
        label: 'Driver: Auth Required',
        color: 'default' as const,
        icon: <LockIcon sx={{ fontSize: '14px !important' }} />,
      };
    }
    if (backendState === 'unreachable') {
      return {
        label: 'Driver: Unavailable',
        color: 'default' as const,
        icon: <HelpOutlineIcon sx={{ fontSize: '14px !important' }} />,
      };
    }
    if (status?.driverRunning) {
      return {
        label: 'Driver: Active',
        color: 'success' as const,
        icon: <VerifiedUserIcon sx={{ fontSize: '14px !important' }} />,
      };
    }
    return {
      label: 'Driver: Offline',
      color: 'error' as const,
      icon: <ErrorOutlineIcon sx={{ fontSize: '14px !important' }} />,
    };
  };

  const getTestModeBadge = () => {
    if (backendState === 'connecting' || (backendState === 'authenticated' && status === null)) {
      return {
        label: 'Test Mode: Checking...',
        color: 'default' as const,
      };
    }
    if (backendState === 'unauthenticated') {
      return {
        label: 'Test Mode: Auth Required',
        color: 'default' as const,
      };
    }
    if (backendState === 'unreachable') {
      return {
        label: 'Test Mode: Unavailable',
        color: 'default' as const,
      };
    }
    if (status?.testSigning) {
      return {
        label: 'Test Mode: ON',
        color: 'success' as const,
      };
    }
    return {
      label: 'Test Mode: OFF',
      color: 'warning' as const,
    };
  };

  const driverBadge = getDriverBadge();
  const testModeBadge = getTestModeBadge();

  const isSpoofInteractive = backendState === 'authenticated' && isConfigLoaded && !isLoading;
  const spoofLabel = !isConfigLoaded || backendState !== 'authenticated'
    ? (backendState === 'unauthenticated'
        ? 'AUTH REQUIRED'
        : backendState === 'unreachable'
        ? 'BACKEND OFFLINE'
        : 'SPOOFING: PENDING')
    : (spoofEnabled ? 'SPOOFING ACTIVE' : 'SPOOFING DISABLED');
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
              SARAB{' '}
              <Typography component="span" variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                {status?.version
                  ? (status.version.startsWith('1.') ? `v${status.version}` : `v${status.version}-beta`)
                  : `v${(import.meta as any).env?.PACKAGE_VERSION || '1.0.0'}`}
              </Typography>
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
            icon={driverBadge.icon}
            label={driverBadge.label}
            color={driverBadge.color}
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<SecurityIcon />}
            label={testModeBadge.label}
            color={testModeBadge.color}
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
                checked={isSpoofInteractive && spoofEnabled}
                onChange={(e) => onToggleSpoof(e.target.checked)}
                disabled={!isSpoofInteractive}
                color="success"
              />
            }
            label={
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: isSpoofInteractive && spoofEnabled ? 'success.main' : 'text.secondary',
                }}
              >
                {spoofLabel}
              </Typography>
            }
            sx={{ m: 0 }}
          />

          <Tooltip title="Refresh State">
            <span>
              <IconButton
                onClick={onRefresh}
                size="small"
                disabled={isLoading}
                sx={{ color: 'text.secondary' }}
              >
                {isLoading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
