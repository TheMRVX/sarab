import React from 'react';
import { Box, Typography } from '@mui/material';
import { SatelliteInfo } from '../types';

interface SkyplotRadarProps {
  satellites: SatelliteInfo[];
  selectedConstellation: string;
}

const getConstellationColor = (constellation?: string) => {
  switch (constellation?.toUpperCase()) {
    case 'GLONASS':
      return '#ff5252';
    case 'GALILEO':
      return '#69f0ae';
    case 'BEIDOU':
      return '#ffd740';
    default:
      return '#00e5ff'; // GPS
  }
};

export const SkyplotRadar: React.FC<SkyplotRadarProps> = ({
  satellites,
  selectedConstellation,
}) => {
  const size = 260;
  const center = size / 2;
  const radius = center - 24;

  const filtered = satellites.filter((s) => {
    if (selectedConstellation === 'ALL') return true;
    return s.constellation?.toUpperCase() === selectedConstellation;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {/* Background Radar Rings */}
        <circle cx={center} cy={center} r={radius} fill="#0d1b2a" stroke="rgba(0, 229, 255, 0.25)" strokeWidth="1.5" />
        <circle cx={center} cy={center} r={radius * 0.66} fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeDasharray="3 3" />
        <circle cx={center} cy={center} r={radius * 0.33} fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeDasharray="3 3" />
        <circle cx={center} cy={center} r={3} fill="#00e5ff" />

        {/* Crosshair Cardinal Lines */}
        <line x1={center} y1={24} x2={center} y2={size - 24} stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
        <line x1={24} y1={center} x2={size - 24} y2={center} stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />

        {/* Cardinal Direction Labels */}
        <text x={center} y={16} textAnchor="middle" fill="#00e5ff" fontSize="11" fontWeight="700">N</text>
        <text x={size - 10} y={center + 4} textAnchor="middle" fill="#ffffff" fontSize="10">E</text>
        <text x={center} y={size - 8} textAnchor="middle" fill="#ffffff" fontSize="10">S</text>
        <text x={10} y={center + 4} textAnchor="middle" fill="#ffffff" fontSize="10">W</text>

        {/* Elevation Angle Labels */}
        <text x={center + 4} y={center - radius * 0.33} fill="rgba(255, 255, 255, 0.4)" fontSize="8">60°</text>
        <text x={center + 4} y={center - radius * 0.66} fill="rgba(255, 255, 255, 0.4)" fontSize="8">30°</text>

        {/* Plot Satellites */}
        {filtered.map((sat) => {
          const elev = Math.max(0, Math.min(90, sat.elevation));
          const r = radius * (1 - elev / 90);
          const rad = ((sat.azimuth - 90) * Math.PI) / 180;
          const x = center + r * Math.cos(rad);
          const y = center + r * Math.sin(rad);
          const color = getConstellationColor(sat.constellation);

          return (
            <g key={sat.id} style={{ cursor: 'pointer' }}>
              {sat.used && (
                <circle cx={x} cy={y} r={10} fill="none" stroke="#69f0ae" strokeWidth="1.5" opacity="0.8" />
              )}
              <circle cx={x} cy={y} r={7} fill={color} opacity="0.9" />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fill="#000000"
                fontSize="8"
                fontWeight="800"
              >
                {sat.prn}
              </text>
            </g>
          );
        })}
      </svg>
      <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
        Polar Skyplot (Center = 90° Zenith, Outer Ring = 0° Horizon)
      </Typography>
    </Box>
  );
};
