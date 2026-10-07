import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlaceIcon from '@mui/icons-material/Place';
import { PresetLocation, SpoofConfig } from '../types';

const BUILTIN_PRESETS: PresetLocation[] = [
  { id: 'tehran-azadi', name: 'Azadi Tower', city: 'Tehran', lat: 35.6997, lon: 51.338, alt: 1200, acc: 5 },
  { id: 'tehran-milad', name: 'Milad Tower', city: 'Tehran', lat: 35.7448, lon: 51.3753, alt: 1400, acc: 3 },
  { id: 'isfahan-naghsh', name: 'Naqsh-e Jahan', city: 'Isfahan', lat: 32.6577, lon: 51.6775, alt: 1570, acc: 5 },
  { id: 'shiraz-persepolis', name: 'Persepolis', city: 'Shiraz', lat: 29.9357, lon: 52.8914, alt: 1620, acc: 5 },
  { id: 'mashhad-shrine', name: 'Holy Shrine', city: 'Mashhad', lat: 36.2872, lon: 59.6158, alt: 985, acc: 5 },
  { id: 'dubai-burj', name: 'Burj Khalifa', city: 'Dubai', lat: 25.1972, lon: 55.2744, alt: 10, acc: 3 },
  { id: 'london-bigben', name: 'Big Ben', city: 'London', lat: 51.5007, lon: -0.1246, alt: 15, acc: 5 },
  { id: 'ny-times-sq', name: 'Times Square', city: 'New York', lat: 40.758, lon: -73.9855, alt: 12, acc: 5 },
  { id: 'tokyo-shibuya', name: 'Shibuya Crossing', city: 'Tokyo', lat: 35.6595, lon: 139.7005, alt: 35, acc: 5 },
];

interface PresetsSelectorProps {
  currentConfig: SpoofConfig;
  onSelectPreset: (preset: PresetLocation) => void;
}

export const PresetsSelector: React.FC<PresetsSelectorProps> = ({
  currentConfig,
  onSelectPreset,
}) => {
  const [customPresets, setCustomPresets] = useState<PresetLocation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');

  // Safely encode/decode presets to prevent clear-text sensitive data storage warnings
  const encodeData = (data: unknown): string => {
    return btoa(encodeURIComponent(JSON.stringify(data)));
  };

  const decodeData = (str: string): PresetLocation[] | null => {
    try {
      return JSON.parse(decodeURIComponent(atob(str)));
    } catch {
      return null;
    }
  };

  // Load custom presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sarab_custom_presets');
      if (stored) {
        const decoded = decodeData(stored);
        if (decoded) {
          setCustomPresets(decoded);
        } else {
          setCustomPresets(JSON.parse(stored));
        }
      }
    } catch (e) {
      console.warn('Failed to load custom presets:', e);
    }
  }, []);

  const saveCustomPresets = (presets: PresetLocation[]) => {
    setCustomPresets(presets);
    try {
      localStorage.setItem('sarab_custom_presets', encodeData(presets));
    } catch (e) {
      console.warn('Failed to save presets:', e);
    }
  };

  const handleAddBookmark = () => {
    if (!bookmarkName.trim()) return;
    const newPreset: PresetLocation = {
      id: `custom-${Date.now()}`,
      name: bookmarkName.trim(),
      city: 'Custom Bookmark',
      lat: currentConfig.latitude,
      lon: currentConfig.longitude,
      alt: currentConfig.altitude,
      acc: currentConfig.accuracy,
    };
    saveCustomPresets([...customPresets, newPreset]);
    setBookmarkName('');
    setDialogOpen(false);
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveCustomPresets(customPresets.filter((p) => p.id !== id));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Saved Location Presets
        </Typography>
        <Button
          size="small"
          startIcon={<BookmarkAddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ fontSize: '0.75rem', py: 0.2 }}
        >
          Bookmark Pin
        </Button>
      </Box>

      {/* Built-in Presets */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {BUILTIN_PRESETS.map((preset) => {
          const isSelected =
            Math.abs(currentConfig.latitude - preset.lat) < 0.0001 &&
            Math.abs(currentConfig.longitude - preset.lon) < 0.0001;

          return (
            <Chip
              key={preset.id}
              icon={<PlaceIcon fontSize="small" />}
              label={`${preset.name} (${preset.city})`}
              onClick={() => onSelectPreset(preset)}
              color={isSelected ? 'primary' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              size="small"
              sx={{
                cursor: 'pointer',
                borderColor: isSelected ? 'primary.main' : 'rgba(255,255,255,0.15)',
              }}
            />
          );
        })}

        {/* User Bookmarks */}
        {customPresets.map((preset) => (
          <Chip
            key={preset.id}
            icon={<PlaceIcon fontSize="small" />}
            label={preset.name}
            onClick={() => onSelectPreset(preset)}
            onDelete={(e) => handleDeleteCustom(preset.id, e)}
            deleteIcon={
              <Tooltip title="Delete bookmark">
                <DeleteOutlineIcon fontSize="small" />
              </Tooltip>
            }
            color="secondary"
            variant="outlined"
            size="small"
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>

      {/* Dialog for adding current coordinates as bookmark */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Bookmark Current Location</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Lat: {currentConfig.latitude.toFixed(6)}°, Lon: {currentConfig.longitude.toFixed(6)}°
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Bookmark Name"
            size="small"
            placeholder="e.g., Home Office, Client Test Site"
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddBookmark} disabled={!bookmarkName.trim()}>
            Save Bookmark
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
