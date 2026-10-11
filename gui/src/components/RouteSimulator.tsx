import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Slider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  LinearProgress,
  Paper,
  Chip,
  FormControlLabel,
  Switch,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import AddLocationIcon from '@mui/icons-material/AddLocation';
import DeleteIcon from '@mui/icons-material/Delete';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import SpeedIcon from '@mui/icons-material/Speed';
import { Waypoint, RouteProfile, SpoofConfig } from '../types';

interface RouteSimulatorProps {
  currentConfig: SpoofConfig;
  onUpdateCoordinates: (lat: number, lon: number) => void;
  onWaypointsChange: (waypoints: Waypoint[]) => void;
}

// Calculate Haversine distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const RouteSimulator: React.FC<RouteSimulatorProps> = ({
  currentConfig,
  onUpdateCoordinates,
  onWaypointsChange,
}) => {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [profile, setProfile] = useState<RouteProfile>('driving');
  const [speedKmh, setSpeedKmh] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);

  const simulationRef = useRef<{
    currentSegment: number;
    segmentProgress: number; // 0.0 to 1.0
  }>({ currentSegment: 0, segmentProgress: 0 });

  // Update profile speed defaults
  const handleProfileChange = (newProfile: RouteProfile) => {
    setProfile(newProfile);
    if (newProfile === 'walking') setSpeedKmh(5);
    else if (newProfile === 'cycling') setSpeedKmh(20);
    else if (newProfile === 'driving') setSpeedKmh(60);
    else if (newProfile === 'highspeed') setSpeedKmh(120);
  };

  const handleAddWaypoint = () => {
    const newWp: Waypoint = {
      id: `wp-${Date.now()}`,
      lat: currentConfig.latitude,
      lon: currentConfig.longitude,
      name: `Point ${waypoints.length + 1}`,
    };
    const updated = [...waypoints, newWp];
    setWaypoints(updated);
    onWaypointsChange(updated);
  };

  const handleRemoveWaypoint = (id: string) => {
    const updated = waypoints.filter((w) => w.id !== id);
    setWaypoints(updated);
    onWaypointsChange(updated);
  };

  const handleClearWaypoints = () => {
    setIsPlaying(false);
    setWaypoints([]);
    onWaypointsChange([]);
    setProgress(0);
    simulationRef.current = { currentSegment: 0, segmentProgress: 0 };
  };

  // 1 Hz simulation ticker
  useEffect(() => {
    if (!isPlaying || waypoints.length < 2) return;

    const interval = setInterval(() => {
      const { currentSegment, segmentProgress } = simulationRef.current;
      const p1 = waypoints[currentSegment];
      const nextSegmentIndex = currentSegment + 1;

      if (nextSegmentIndex >= waypoints.length) {
        if (isLooping) {
          simulationRef.current = { currentSegment: 0, segmentProgress: 0 };
          return;
        } else {
          setIsPlaying(false);
          setProgress(100);
          return;
        }
      }

      const p2 = waypoints[nextSegmentIndex];
      const distTotal = getDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);

      // Distance covered in 1 second at speedKmh:
      const metersPerSecond = (speedKmh * 1000) / 3600;
      const progressIncrement = distTotal > 0 ? metersPerSecond / distTotal : 1.0;

      const newSegmentProgress = segmentProgress + progressIncrement;

      // If natural drift is active, superimpose organic road micro-flutter
      let jitterLat = 0;
      let jitterLon = 0;
      if (currentConfig.driftEnabled && currentConfig.driftRadius > 0) {
        const u1 = Math.max(1e-15, Math.random());
        const u2 = Math.random();
        const r = Math.sqrt(-2.0 * Math.log(u1));
        const theta = 2.0 * Math.PI * u2;
        const z0 = r * Math.cos(theta);
        const z1 = r * Math.sin(theta);
        const jitterMeters = currentConfig.driftRadius * 0.35;
        jitterLat = (z0 * jitterMeters) / 111132.95;
        const cosLat = Math.cos((p1.lat * Math.PI) / 180);
        jitterLon = (z1 * jitterMeters) / (111132.95 * (Math.abs(cosLat) < 0.01 ? 0.01 : cosLat));
      }

      if (newSegmentProgress >= 1.0) {
        // Move to next segment
        simulationRef.current = {
          currentSegment: nextSegmentIndex,
          segmentProgress: 0,
        };
        onUpdateCoordinates(
          parseFloat((p2.lat + jitterLat).toFixed(7)),
          parseFloat((p2.lon + jitterLon).toFixed(7))
        );
      } else {
        // Linear interpolation with natural micro-jitter
        simulationRef.current.segmentProgress = newSegmentProgress;
        const currentLat = p1.lat + (p2.lat - p1.lat) * newSegmentProgress + jitterLat;
        const currentLon = p1.lon + (p2.lon - p1.lon) * newSegmentProgress + jitterLon;
        onUpdateCoordinates(
          parseFloat(currentLat.toFixed(7)),
          parseFloat(currentLon.toFixed(7))
        );
      }

      // Calculate overall route percentage
      const totalSegments = waypoints.length - 1;
      const overallPercent =
        ((currentSegment + newSegmentProgress) / totalSegments) * 100;
      setProgress(Math.min(100, Math.max(0, overallPercent)));
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, waypoints, speedKmh, isLooping, onUpdateCoordinates]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Dynamic Route & Kinematics Simulator
        </Typography>
        <Chip
          size="small"
          label={isPlaying ? 'SIMULATION RUNNING' : 'STOPPED'}
          color={isPlaying ? 'success' : 'default'}
          variant="outlined"
        />
      </Box>

      {/* Profile Selector Buttons */}
      <ButtonGroup fullWidth size="small" variant="outlined">
        <Button
          onClick={() => handleProfileChange('walking')}
          variant={profile === 'walking' ? 'contained' : 'outlined'}
          startIcon={<DirectionsWalkIcon />}
        >
          Walk (5km/h)
        </Button>
        <Button
          onClick={() => handleProfileChange('cycling')}
          variant={profile === 'cycling' ? 'contained' : 'outlined'}
          startIcon={<DirectionsBikeIcon />}
        >
          Bike (20km/h)
        </Button>
        <Button
          onClick={() => handleProfileChange('driving')}
          variant={profile === 'driving' ? 'contained' : 'outlined'}
          startIcon={<DirectionsCarIcon />}
        >
          Car (60km/h)
        </Button>
      </ButtonGroup>

      {/* Speed Slider */}
      <Box sx={{ px: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SpeedIcon fontSize="small" sx={{ color: 'primary.main' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Simulated Velocity:</Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>
            {speedKmh} km/h ({(speedKmh / 3.6).toFixed(1)} m/s)
          </Typography>
        </Box>
        <Slider
          value={speedKmh}
          min={1}
          max={150}
          onChange={(_, val) => setSpeedKmh(val as number)}
          sx={{ color: 'primary.main' }}
        />
      </Box>

      {/* Simulation Playback Bar */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="contained"
          color="success"
          startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={waypoints.length < 2}
          sx={{ flex: 1, fontWeight: 700 }}
        >
          {isPlaying ? 'Pause' : 'Start Simulation'}
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={() => {
            setIsPlaying(false);
            setProgress(0);
            simulationRef.current = { currentSegment: 0, segmentProgress: 0 };
          }}
          disabled={!isPlaying && progress === 0}
        >
          Stop
        </Button>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={isLooping}
              onChange={(e) => setIsLooping(e.target.checked)}
              color="primary"
            />
          }
          label={<Typography variant="caption">Loop</Typography>}
          sx={{ m: 0 }}
        />
      </Box>

      {/* Progress Bar */}
      <Box sx={{ width: '100%' }}>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 6, borderRadius: 3 }} />
      </Box>

      {/* Waypoints List */}
      <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 180, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Waypoints Queue ({waypoints.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<AddLocationIcon />} onClick={handleAddWaypoint}>
              Add Current
            </Button>
            {waypoints.length > 0 && (
              <Button size="small" color="error" onClick={handleClearWaypoints}>
                Clear
              </Button>
            )}
          </Box>
        </Box>

        {waypoints.length === 0 ? (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', py: 2, color: 'text.secondary' }}>
            No waypoints yet. Move the map pin and click "Add Current" to create a path.
          </Typography>
        ) : (
          <List dense disablePadding>
            {waypoints.map((wp, index) => (
              <ListItem
                key={wp.id}
                secondaryAction={
                  <IconButton edge="end" size="small" onClick={() => handleRemoveWaypoint(wp.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
                sx={{ py: 0.3 }}
              >
                <ListItemText
                  primary={`${index + 1}. ${wp.name || 'Waypoint'}`}
                  secondary={`Lat: ${wp.lat.toFixed(5)}°, Lon: ${wp.lon.toFixed(5)}°`}
                  primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 600 }}
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};
