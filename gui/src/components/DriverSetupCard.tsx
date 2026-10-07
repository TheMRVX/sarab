import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TerminalIcon from '@mui/icons-material/Terminal';
import MemoryIcon from '@mui/icons-material/Memory';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PrivacyTipIcon from '@mui/icons-material/PrivacyTip';
import BuildIcon from '@mui/icons-material/Build';
import { SystemStatus } from '../types';

interface DriverSetupCardProps {
  status: SystemStatus | null;
  onRefresh: () => void;
  isLoading?: boolean;
}

export const DriverSetupCard: React.FC<DriverSetupCardProps> = ({
  status,
  onRefresh,
  isLoading = false,
}) => {
  const [copyCodeSuccess, setCopyCodeSuccess] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopyCodeSuccess(code);
    setTimeout(() => setCopyCodeSuccess(null), 2000);
  };

  const statusItems = [
    {
      title: 'UMDF 2.0 Driver State',
      desc: status?.driverRunning ? 'Virtual GNSS sensor active in Device Manager' : 'Driver not running or device disabled',
      ok: status?.driverRunning ?? false,
      icon: <MemoryIcon />,
    },
    {
      title: 'Windows Test Signing',
      desc: status?.testSigningDetails || (status?.testSigning ? 'Enabled (test root CA trusted)' : 'Disabled - required for self-signed driver'),
      ok: status?.testSigning ?? false,
      icon: <BuildIcon />,
    },
    {
      title: 'Windows Location Privacy',
      desc: status?.locationPrivacyDetails || (status?.locationPrivacy ? 'Allowed (Desktop & Store apps)' : 'Blocked in Windows Settings'),
      ok: status?.locationPrivacy ?? false,
      icon: <PrivacyTipIcon />,
    },
    {
      title: 'BitLocker Protection',
      desc: status?.bitlocker || 'Protection suspended or BitLocker disabled',
      ok: true,
      icon: <LockOpenIcon />,
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header and Refresh */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Driver & System Health
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Kernel & UMDF 2.0 sensor subsystem verification
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={isLoading}
          sx={{ textTransform: 'none' }}
        >
          {isLoading ? 'Checking...' : 'Refresh'}
        </Button>
      </Box>

      {/* Status Grid */}
      <Grid container spacing={1.5}>
        {statusItems.map((item, index) => (
          <Grid item xs={12} sm={6} key={index}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: 'background.paper',
                borderColor: item.ok ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 82, 82, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              <Box sx={{ color: item.ok ? 'success.main' : 'error.main', mt: 0.2 }}>
                {item.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {item.title}
                  </Typography>
                  <Chip
                    size="small"
                    icon={item.ok ? <CheckCircleIcon sx={{ fontSize: '13px !important' }} /> : <ErrorIcon sx={{ fontSize: '13px !important' }} />}
                    label={item.ok ? 'OK' : 'ATTENTION'}
                    color={item.ok ? 'success' : 'error'}
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', wordBreak: 'break-word' }}>
                  {item.desc}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Troubleshooting PowerShell helpers */}
      <Accordion
        disableGutters
        sx={{
          bgcolor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px !important',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TerminalIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Administrative Command Reference
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, fontSize: '0.82rem' }}>
            Run these commands in an elevated PowerShell terminal (Administrator) if you need to reinstall or reset the driver:
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                1. Re-install Driver Package via CLI:
              </Typography>
              <Paper
                onClick={() => handleCopyCode('sarab.exe driver install')}
                sx={{
                  p: 1,
                  mt: 0.5,
                  bgcolor: '#05070a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'primary.light',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <code>sarab.exe driver install</code>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {copyCodeSuccess === 'sarab.exe driver install' ? 'Copied!' : 'Click to copy'}
                </Typography>
              </Paper>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                2. Test Live Location Fix via CLI:
              </Typography>
              <Paper
                onClick={() => handleCopyCode('sarab.exe read --live')}
                sx={{
                  p: 1,
                  mt: 0.5,
                  bgcolor: '#05070a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'primary.light',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <code>sarab.exe read --live</code>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {copyCodeSuccess === 'sarab.exe read --live' ? 'Copied!' : 'Click to copy'}
                </Typography>
              </Paper>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                3. Enable Windows Test Mode:
              </Typography>
              <Paper
                onClick={() => handleCopyCode('bcdedit /set testsigning on')}
                sx={{
                  p: 1,
                  mt: 0.5,
                  bgcolor: '#05070a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'primary.light',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <code>bcdedit /set testsigning on</code>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {copyCodeSuccess === 'bcdedit /set testsigning on' ? 'Copied!' : 'Click to copy'}
                </Typography>
              </Paper>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
