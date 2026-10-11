import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Slider,
  Button,
  Grid,
  Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import HeightIcon from '@mui/icons-material/Height';
import AdjustIcon from '@mui/icons-material/Adjust';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { SpoofConfig } from '../types';

interface CoordinateFormProps {
  config: SpoofConfig;
  onApply: (newConfig: SpoofConfig) => void;
  isLoading?: boolean;
}

export const CoordinateForm: React.FC<CoordinateFormProps> = ({
  config,
  onApply,
  isLoading = false,
}) => {
  const [lat, setLat] = useState<string>(config.latitude.toString());
  const [lon, setLon] = useState<string>(config.longitude.toString());
  const [alt, setAlt] = useState<string>(config.altitude.toString());
  const [acc, setAcc] = useState<number>(config.accuracy);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Sync internal state when config changes from map click or preset
  useEffect(() => {
    setLat(config.latitude.toString());
    setLon(config.longitude.toString());
    setAlt(config.altitude.toString());
    setAcc(config.accuracy);
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const parsedAlt = parseFloat(alt);

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setError('Latitude must be between -90.0° and 90.0°');
      return;
    }

    if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setError('Longitude must be between -180.0° and 180.0°');
      return;
    }

    if (isNaN(parsedAlt)) {
      setError('Altitude must be a valid number');
      return;
    }

    onApply({
      latitude: parsedLat,
      longitude: parsedLon,
      altitude: parsedAlt,
      accuracy: acc,
      enabled: config.enabled,
      driftEnabled: config.driftEnabled,
      driftRadius: config.driftRadius,
    });

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Target Coordinates & Parameters
      </Typography>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success">Coordinates successfully applied to Windows Location!</Alert>}

      <Grid container spacing={2}>
        {/* Latitude */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Latitude"
            size="small"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LocationOnIcon fontSize="small" sx={{ color: 'primary.main' }} />
                </InputAdornment>
              ),
              endAdornment: <InputAdornment position="end">°</InputAdornment>,
            }}
          />
        </Grid>

        {/* Longitude */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Longitude"
            size="small"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LocationOnIcon fontSize="small" sx={{ color: 'secondary.main' }} />
                </InputAdornment>
              ),
              endAdornment: <InputAdornment position="end">°</InputAdornment>,
            }}
          />
        </Grid>

        {/* Altitude */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Altitude"
            size="small"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <HeightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: <InputAdornment position="end">m</InputAdornment>,
            }}
          />
        </Grid>

        {/* Accuracy Numeric Input */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Horizontal Accuracy"
            size="small"
            value={acc}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val > 0) setAcc(val);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AdjustIcon fontSize="small" sx={{ color: 'success.main' }} />
                </InputAdornment>
              ),
              endAdornment: <InputAdornment position="end">m</InputAdornment>,
            }}
          />
        </Grid>
      </Grid>

      {/* Accuracy Slider */}
      <Box sx={{ px: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Accuracy Radius Slider:</Typography>
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>{acc.toFixed(1)} m</Typography>
        </Box>
        <Slider
          value={acc}
          min={1}
          max={50}
          step={0.5}
          onChange={(_, val) => setAcc(val as number)}
          marks={[
            { value: 1, label: '1m' },
            { value: 5, label: '5m' },
            { value: 15, label: '15m' },
            { value: 30, label: '30m' },
            { value: 50, label: '50m' },
          ]}
          valueLabelDisplay="auto"
          sx={{ color: 'primary.main' }}
        />
      </Box>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="medium"
          disabled={isLoading}
          startIcon={<SendIcon />}
          sx={{
            py: 1,
            bgcolor: 'primary.main',
            color: '#000',
            fontWeight: 700,
            '&:hover': { bgcolor: 'primary.light' },
          }}
        >
          Apply to Windows Location
        </Button>
      </Box>
    </Box>
  );
};
