import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import L from 'leaflet';
import { Waypoint } from '../types';

// Custom modern SVG Pin Icon for target position
const createCustomIcon = (color = '#00e5ff') => {
  return L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        transform: translate(-16px, -32px);
      ">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="${color}" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.6));">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <div style="
          position: absolute;
          bottom: 2px;
          left: 10px;
          width: 12px;
          height: 12px;
          background: ${color};
          border-radius: 50%;
          opacity: 0.6;
          animation: pulse 1.5s infinite;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
};

interface MapViewProps {
  latitude: number;
  longitude: number;
  accuracy: number;
  onCoordinateChange: (lat: number, lon: number) => void;
  waypoints?: Waypoint[];
}

export const MapView: React.FC<MapViewProps> = ({
  latitude,
  longitude,
  accuracy,
  onCoordinateChange,
  waypoints = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Keep a stable ref to callback so map event listeners don't need re-attaching
  const onCoordinateChangeRef = useRef(onCoordinateChange);
  useEffect(() => {
    onCoordinateChangeRef.current = onCoordinateChange;
  }, [onCoordinateChange]);

  // Initialize pure Leaflet map instance (React.StrictMode safe with cleanup)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 14,
    });
    mapRef.current = map;

    // OpenStreetMap dark-style tiles (100% free, BSD/ODbL compliant, no external non-free code)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'dark-tile-layer',
    }).addTo(map);

    // Accuracy Circle
    const circle = L.circle([latitude, longitude], {
      radius: accuracy,
      color: '#00e5ff',
      fillColor: '#00e5ff',
      fillOpacity: 0.15,
      weight: 1.5,
    }).addTo(map);
    circleRef.current = circle;

    // Draggable Target Marker
    const marker = L.marker([latitude, longitude], {
      icon: createCustomIcon('#00e5ff'),
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onCoordinateChangeRef.current(
        parseFloat(pos.lat.toFixed(7)),
        parseFloat(pos.lng.toFixed(7))
      );
    });

    // Map Click Listener
    map.on('click', (e: L.LeafletMouseEvent) => {
      onCoordinateChangeRef.current(
        parseFloat(e.latlng.lat.toFixed(7)),
        parseFloat(e.latlng.lng.toFixed(7))
      );
    });

    // Route Polyline
    const polyline = L.polyline([], {
      color: '#7c4dff',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 8',
    }).addTo(map);
    polylineRef.current = polyline;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      polylineRef.current = null;
    };
  }, []); // Run once on mount

  // Synchronize target position & accuracy when props update
  useEffect(() => {
    if (!mapRef.current) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    }
    if (circleRef.current) {
      circleRef.current.setLatLng([latitude, longitude]);
      circleRef.current.setRadius(accuracy);
    }
    mapRef.current.panTo([latitude, longitude], { animate: true });
  }, [latitude, longitude, accuracy]);

  // Synchronize route waypoints polyline
  useEffect(() => {
    if (!polylineRef.current) return;
    const coords: [number, number][] = waypoints.map((w) => [w.lat, w.lon]);
    polylineRef.current.setLatLngs(coords);
  }, [waypoints]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchQuery
      )}&limit=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': `Sarab-GNSS-Suite/1.0.2`,
        },
      });
      const data = await res.json();
      if (data && data.length > 0) {
        const newLat = parseFloat(parseFloat(data[0].lat).toFixed(7));
        const newLon = parseFloat(parseFloat(data[0].lon).toFixed(7));
        onCoordinateChange(newLat, newLon);
      } else {
        setSearchError('Location not found');
      }
    } catch {
      setSearchError('Geocoding service unavailable');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Search Bar Overlay */}
      <Box
        component="form"
        onSubmit={handleSearch}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: { xs: 16, sm: 'auto' },
          zIndex: 1000,
          width: { sm: 340 },
        }}
      >
        <Paper
          elevation={4}
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: '2px 4px',
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: '1px solid rgba(0, 229, 255, 0.25)',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Search city, address, or landmark..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: { px: 1, fontSize: '0.9rem' },
              endAdornment: (
                <InputAdornment position="end">
                  {isSearching ? (
                    <CircularProgress size={20} color="primary" />
                  ) : (
                    <IconButton size="small" onClick={() => handleSearch()} color="primary">
                      <SearchIcon fontSize="small" />
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            }}
          />
        </Paper>
        {searchError && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.5,
              ml: 1,
              color: 'error.main',
              bgcolor: 'rgba(0,0,0,0.8)',
              px: 1,
              borderRadius: 1,
            }}
          >
            {searchError}
          </Typography>
        )}
      </Box>

      {/* Recenter Quick Button */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <Paper
          elevation={4}
          sx={{
            borderRadius: '50%',
            bgcolor: 'background.paper',
            border: '1px solid rgba(0, 229, 255, 0.3)',
          }}
        >
          <IconButton
            color="primary"
            onClick={() => onCoordinateChange(latitude, longitude)}
            title="Recenter Map"
          >
            <MyLocationIcon />
          </IconButton>
        </Paper>
      </Box>

      {/* Main Map Container Div */}
      <Box
        ref={mapContainerRef}
        sx={{
          height: '100%',
          width: '100%',
          backgroundColor: '#0a0e14',
          '& .leaflet-container': {
            height: '100%',
            width: '100%',
            backgroundColor: '#0a0e14',
          },
        }}
      />
    </Paper>
  );
};
