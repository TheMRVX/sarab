import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Slider,
  ButtonGroup,
  Button,
  Chip,
} from '@mui/material';
import WavesIcon from '@mui/icons-material/Waves';
import SecurityIcon from '@mui/icons-material/Security';
import { DriftPoint } from '../types';

interface DriftControlCardProps {
  driftEnabled: boolean;
  driftRadius: number;
  onToggleDrift: (enabled: boolean) => void;
  onChangeRadius: (radius: number) => void;
}

export const DriftControlCard: React.FC<DriftControlCardProps> = ({
  driftEnabled,
  driftRadius,
  onToggleDrift,
  onChangeRadius,
}) => {
  // 2D wander point trail for scatter radar
  const [points, setPoints] = useState<DriftPoint[]>([]);
  const [currentOffset, setCurrentOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const driftStateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1Hz discrete Gauss-Markov Ornstein-Uhlenbeck simulation for the visual radar
  useEffect(() => {
    if (!driftEnabled) {
      setPoints([]);
      setCurrentOffset({ x: 0, y: 0 });
      driftStateRef.current = { x: 0, y: 0 };
      return;
    }

    const interval = setInterval(() => {
      // Box-Muller transform for standard normal variates
      const u1 = Math.max(1e-15, Math.random());
      const u2 = Math.random();
      const r = Math.sqrt(-2.0 * Math.log(u1));
      const theta = 2.0 * Math.PI * u2;
      const z0 = r * Math.cos(theta);
      const z1 = r * Math.sin(theta);

      // Autoregressive coefficient alpha ~ 0.90 for ~10s autocorrelation
      const alpha = 0.90;
      const beta = driftRadius * Math.sqrt(1.0 - alpha * alpha);

      const nextX = alpha * driftStateRef.current.x + beta * z0;
      const nextY = alpha * driftStateRef.current.y + beta * z1;

      driftStateRef.current = { x: nextX, y: nextY };
      setCurrentOffset({ x: nextX, y: nextY });

      setPoints((prev) => {
        const updated = [...prev, { x: nextX, y: nextY, timestamp: Date.now() }];
        // Keep trailing 30 epochs
        return updated.slice(-30);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [driftEnabled, driftRadius]);

  const maxRange = Math.max(3.0, driftRadius * 2.0);
  const radarRadius = 85; // SVG coordinate units

  const mapToRadar = (meters: number) => {
    return (meters / maxRange) * radarRadius;
  };

  const currentDist = Math.sqrt(currentOffset.x * currentOffset.x + currentOffset.y * currentOffset.y);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderColor: driftEnabled ? 'rgba(0, 229, 255, 0.3)' : 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Header and Master Switch */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WavesIcon sx={{ color: driftEnabled ? 'primary.main' : 'text.secondary' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
            Natural GNSS Drift & Jitter
          </Typography>
        </Box>
        <Chip
          size="small"
          label={driftEnabled ? 'Gauss-Markov OU' : 'Static Locked'}
          color={driftEnabled ? 'primary' : 'default'}
          variant={driftEnabled ? 'filled' : 'outlined'}
          sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600 }}
        />
      </Box>

      {/* Switch Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
          Simulate realistic organic sensor wander
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={driftEnabled}
              onChange={(e) => onToggleDrift(e.target.checked)}
              color="primary"
              size="small"
            />
          }
          label=""
          sx={{ m: 0 }}
        />
      </Box>

      {/* Preset Intensity Buttons */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          Drift Intensity Profiles:
        </Typography>
        <ButtonGroup
          size="small"
          variant="outlined"
          fullWidth
          disabled={!driftEnabled}
          sx={{
            '& .MuiButton-root': {
              fontSize: '0.75rem',
              py: 0.5,
              borderColor: 'rgba(255, 255, 255, 0.12)',
            },
          }}
        >
          <Button
            variant={driftEnabled && Math.abs(driftRadius - 0.4) < 0.1 ? 'contained' : 'outlined'}
            onClick={() => onChangeRadius(0.4)}
          >
            Subtle (±0.4m)
          </Button>
          <Button
            variant={driftEnabled && Math.abs(driftRadius - 1.2) < 0.1 ? 'contained' : 'outlined'}
            onClick={() => onChangeRadius(1.2)}
          >
            Standard (±1.2m)
          </Button>
          <Button
            variant={driftEnabled && Math.abs(driftRadius - 2.5) < 0.1 ? 'contained' : 'outlined'}
            onClick={() => onChangeRadius(2.5)}
          >
            Urban (±2.5m)
          </Button>
        </ButtonGroup>
      </Box>

      {/* Fine-Tuning Slider */}
      <Box sx={{ px: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Dispersion Standard Deviation (σ):
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.light' }}>
            ±{driftRadius.toFixed(1)} meters
          </Typography>
        </Box>
        <Slider
          size="small"
          value={driftRadius}
          min={0.1}
          max={5.0}
          step={0.1}
          disabled={!driftEnabled}
          onChange={(_, val) => onChangeRadius(val as number)}
          sx={{ color: 'primary.main' }}
        />
      </Box>

      {/* 2D Drift Scatter Radar Canvas */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          bgcolor: '#060a0f',
          p: 1.5,
          borderRadius: 2,
          border: '1px solid rgba(0, 229, 255, 0.12)',
          position: 'relative',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Live 2D Scatter Radar (30 Epochs)
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              color: driftEnabled ? 'primary.light' : 'text.disabled',
              fontSize: '0.72rem',
            }}
          >
            Δ: {currentDist.toFixed(2)}m (N: {currentOffset.y >= 0 ? '+' : ''}{currentOffset.y.toFixed(2)}m, E: {currentOffset.x >= 0 ? '+' : ''}{currentOffset.x.toFixed(2)}m)
          </Typography>
        </Box>

        <svg width="200" height="200" viewBox="-100 -100 200 200">
          {/* Concentric range rings */}
          <circle cx="0" cy="0" r={mapToRadar(1.0)} fill="none" stroke="rgba(0, 229, 255, 0.1)" strokeWidth="1" strokeDasharray="2,2" />
          <circle cx="0" cy="0" r={mapToRadar(2.0)} fill="none" stroke="rgba(0, 229, 255, 0.15)" strokeWidth="1" strokeDasharray="3,3" />
          <circle cx="0" cy="0" r={mapToRadar(3.0)} fill="none" stroke="rgba(0, 229, 255, 0.2)" strokeWidth="1" />

          {/* Crosshair axes */}
          <line x1="-95" y1="0" x2="95" y2="0" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
          <line x1="0" y1="-95" x2="0" y2="95" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />

          {/* Cardinal direction labels */}
          <text x="0" y="-88" textAnchor="middle" fill="#8c9ba5" fontSize="8" fontFamily="monospace">N</text>
          <text x="0" y="95" textAnchor="middle" fill="#8c9ba5" fontSize="8" fontFamily="monospace">S</text>
          <text x="92" y="3" textAnchor="middle" fill="#8c9ba5" fontSize="8" fontFamily="monospace">E</text>
          <text x="-92" y="3" textAnchor="middle" fill="#8c9ba5" fontSize="8" fontFamily="monospace">W</text>

          {/* Range ring text */}
          <text x="3" y={-mapToRadar(1.0) + 9} fill="rgba(0, 229, 255, 0.4)" fontSize="7" fontFamily="monospace">1m</text>
          <text x="3" y={-mapToRadar(2.0) + 9} fill="rgba(0, 229, 255, 0.4)" fontSize="7" fontFamily="monospace">2m</text>

          {/* Historical points */}
          {points.map((pt, i) => {
            const age = points.length - i;
            const opacity = Math.max(0.15, 1 - age / 30);
            const cx = mapToRadar(pt.x);
            const cy = -mapToRadar(pt.y); // invert Y for SVG (North is up)
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={i === points.length - 1 ? 4 : 2}
                fill={i === points.length - 1 ? '#00e5ff' : '#7c4dff'}
                opacity={opacity}
              />
            );
          })}

          {/* Center target anchor */}
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
          <circle cx="0" cy="0" r="1" fill="#000000" />
        </svg>

        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', mt: 0.5 }}>
          Center = Target Anchor • Purple = Past Trail • Cyan = Active Fix
        </Typography>
      </Box>

      {/* Anti-Detection Security Callout */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(0, 229, 255, 0.04)', p: 1, borderRadius: 1 }}>
        <SecurityIcon sx={{ color: 'primary.main', fontSize: 18 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
          Defeats zero-variance anomaly detection in game anti-cheat engines & GNSS IDS checkers (e.g. gpsnitch).
        </Typography>
      </Box>
    </Paper>
  );
};
