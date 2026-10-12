import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  LinearProgress,
  Chip,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import { SatelliteInfo } from '../types';
import { SkyplotRadar } from './SkyplotRadar';
import { NmeaStreamViewer } from './NmeaStreamViewer';

interface SatelliteCardProps {
  satellites: SatelliteInfo[];
}

export const SatelliteCard: React.FC<SatelliteCardProps> = ({ satellites }) => {
  const [constellation, setConstellation] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'radar' | 'bars'>('radar');

  const lockedCount = satellites.filter((s) => s.used).length;
  const filtered = satellites.filter((s) => {
    if (constellation === 'ALL') return true;
    return s.constellation?.toUpperCase() === constellation;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header and Counters */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SatelliteAltIcon sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Multi-Constellation GNSS Skyplot
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            label={`${lockedCount}/${satellites.length} Locked`}
            color={lockedCount >= 4 ? 'success' : 'warning'}
            variant="outlined"
          />
          <ToggleButtonGroup
            size="small"
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
          >
            <ToggleButton value="radar">Radar</ToggleButton>
            <ToggleButton value="bars">Signals</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Constellation Filters */}
      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
        {['ALL', 'GPS', 'GLONASS', 'GALILEO', 'BEIDOU'].map((c) => (
          <Chip
            key={c}
            size="small"
            label={c}
            clickable
            color={constellation === c ? 'primary' : 'default'}
            variant={constellation === c ? 'filled' : 'outlined'}
            onClick={() => setConstellation(c)}
            sx={{ fontSize: '0.7rem', height: 24 }}
          />
        ))}
      </Box>

      {/* Radar View vs SNR Bars */}
      {viewMode === 'radar' ? (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#070d19', display: 'flex', justifyContent: 'center' }}>
          <SkyplotRadar satellites={satellites} selectedConstellation={constellation} />
        </Paper>
      ) : (
        <Grid container spacing={1.5} sx={{ maxHeight: 300, overflowY: 'auto' }}>
          {filtered.map((sat) => {
            const snrPercent = Math.min(100, (sat.snr / 50) * 100);
            const snrColor = sat.snr >= 40 ? 'success' : sat.snr >= 30 ? 'primary' : 'warning';

            return (
              <Grid item xs={12} sm={6} key={sat.id}>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>
                      {sat.constellation || 'GPS'} PRN #{sat.prn}
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
      )}

      {/* NMEA Live Stream Terminal */}
      <NmeaStreamViewer />
    </Box>
  );
};
