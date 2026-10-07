import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  LinearProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import ShieldIcon from '@mui/icons-material/Shield';
import { SatelliteInfo } from '../types';

interface SatelliteCardProps {
  satellites: SatelliteInfo[];
}

export const SatelliteCard: React.FC<SatelliteCardProps> = ({ satellites }) => {
  const lockedCount = satellites.filter((s) => s.used).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SatelliteAltIcon sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            GNSS Satellite Constellation
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${lockedCount} Sats Locked`}
          color={lockedCount >= 4 ? 'success' : 'warning'}
          variant="outlined"
        />
      </Box>

      {/* Anti-Spoofing Stealth Status */}
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          bgcolor: 'rgba(0, 229, 255, 0.04)',
          borderColor: 'rgba(0, 229, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <ShieldIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
            Stealth Telemetry Guard (Anti-IDS Active)
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
            Simulates realistic elevation-dependent SNR spread (28–44 dB-Hz) to prevent detection by GPS intrusion detection systems (such as gpsnitch).
          </Typography>
        </Box>
      </Paper>

      {/* Satellite Telemetry Grid */}
      <Grid container spacing={1.5}>
        {satellites.map((sat) => {
          // Normalize SNR (0-50 dB-Hz scale)
          const snrPercent = Math.min(100, (sat.snr / 50) * 100);
          const snrColor = sat.snr >= 40 ? 'success' : sat.snr >= 30 ? 'primary' : 'warning';

          return (
            <Grid item xs={12} sm={6} key={sat.id}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>
                    GPS PRN #{sat.prn}
                  </Typography>
                  <Tooltip title={`Azimuth: ${sat.azimuth}° | Elevation: ${sat.elevation}°`}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      El: {sat.elevation}° | Az: {sat.azimuth}°
                    </Typography>
                  </Tooltip>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Signal-to-Noise Ratio:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: `${snrColor}.main` }}>
                    {sat.snr.toFixed(1)} dB-Hz
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={snrPercent}
                  color={snrColor}
                  sx={{ height: 5, borderRadius: 2 }}
                />
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};
