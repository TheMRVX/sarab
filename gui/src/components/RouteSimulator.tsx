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
  Alert,
  Tooltip,
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
import AltRouteIcon from '@mui/icons-material/AltRoute';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import NavigationIcon from '@mui/icons-material/Navigation';
import { Waypoint, RouteProfile, SpoofConfig, RouteStatus } from '../types';

interface RouteSimulatorProps {
  currentConfig: SpoofConfig;
  onUpdateCoordinates: (lat: number, lon: number) => void;
  onWaypointsChange: (waypoints: Waypoint[]) => void;
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
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [activeSpeed, setActiveSpeed] = useState<number>(60);

  const [isSnapping, setIsSnapping] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll server-side route status every 1000ms to stay synchronized headlessly
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const res = await fetch('/api/route/status');
        if (res.ok) {
          const data: RouteStatus = await res.json();
          setIsPlaying(data.is_running);
          setIsPaused(data.is_paused);
          setProgress(data.progress_percent);
          setCurrentHeading(data.current_heading);
          setActiveSpeed(data.current_speed_kmh);

          if (data.is_running && !data.is_paused) {
            onUpdateCoordinates(
              parseFloat(data.current_lat.toFixed(7)),
              parseFloat(data.current_lon.toFixed(7))
            );
          }
        }
      } catch {
        // Fallback or offline dev server
      }
    };

    const interval = setInterval(checkServerStatus, 1000);
    return () => clearInterval(interval);
  }, [onUpdateCoordinates]);

  // Profile selection
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
    setStatusMessage(null);
  };

  const handleRemoveWaypoint = (id: string) => {
    const updated = waypoints.filter((w) => w.id !== id);
    setWaypoints(updated);
    onWaypointsChange(updated);
  };

  const handleClearWaypoints = async () => {
    try {
      await fetch('/api/route/stop', { method: 'POST' });
    } catch {
      // Ignore
    }
    setIsPlaying(false);
    setIsPaused(false);
    setWaypoints([]);
    onWaypointsChange([]);
    setProgress(0);
    setStatusMessage(null);
  };

  // Start or resume headless simulation on the server
  const handleStartSimulation = async () => {
    if (waypoints.length < 2) return;

    if (isPlaying && !isPaused) {
      // Pause
      try {
        await fetch('/api/route/pause', { method: 'POST' });
        setIsPaused(true);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (isPlaying && isPaused) {
      // Resume
      try {
        await fetch('/api/route/resume', { method: 'POST' });
        setIsPaused(false);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    try {
      const payload = {
        waypoints: waypoints.map((w) => ({
          lat: w.lat,
          lon: w.lon,
        })),
        speed_kmh: speedKmh,
        is_looping: isLooping,
        profile: profile === 'walking' ? 'walking' : profile === 'cycling' ? 'cycling' : 'driving',
      };

      const res = await fetch('/api/route/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsPlaying(true);
        setIsPaused(false);
        setStatusMessage('Headless server simulation running in background');
      } else {
        const err = await res.json();
        setStatusMessage(`Error: ${err.error || 'Failed to start simulation'}`);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Network error communicating with route runner');
    }
  };

  const handleStopSimulation = async () => {
    try {
      await fetch('/api/route/stop', { method: 'POST' });
    } catch {
      // Ignore
    }
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setStatusMessage(null);
  };

  // OSRM Road Snapping
  const handleSnapToRoads = async () => {
    if (waypoints.length < 2) {
      setStatusMessage('Add at least 2 waypoints before snapping to roads.');
      return;
    }

    setIsSnapping(true);
    setStatusMessage('Querying OSRM road network...');

    try {
      const res = await fetch('/api/route/osrm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: waypoints.map((w) => [w.lat, w.lon]),
          profile: profile === 'walking' ? 'walking' : profile === 'cycling' ? 'cycling' : 'driving',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0 && data.routes[0].geometry) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates;
          const snappedWps: Waypoint[] = coords.map((c, idx) => ({
            id: `osrm-${idx}-${Date.now()}`,
            lat: parseFloat(c[1].toFixed(7)),
            lon: parseFloat(c[0].toFixed(7)),
            name: `Road Pt ${idx + 1}`,
          }));

          setWaypoints(snappedWps);
          onWaypointsChange(snappedWps);
          const distKm = (data.routes[0].distance / 1000).toFixed(2);
          setStatusMessage(`Snapped to ${snappedWps.length} road coordinates (${distKm} km)`);
        } else {
          setStatusMessage('No road geometry returned by OSRM.');
        }
      } else {
        const err = await res.json();
        setStatusMessage(`OSRM Error: ${err.error || 'Routing failed'}`);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Failed to connect to OSRM service');
    } finally {
      setIsSnapping(false);
    }
  };

  // GPX File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      try {
        const res = await fetch('/api/route/gpx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xml: content }),
        });

        if (res.ok) {
          const track = await res.json();
          const loadedWps: Waypoint[] = track.waypoints.map((w: any, idx: number) => ({
            id: `gpx-${idx}-${Date.now()}`,
            lat: parseFloat(w.lat.toFixed(7)),
            lon: parseFloat(w.lon.toFixed(7)),
            name: w.time ? `WP ${idx + 1} (${w.time.slice(11, 19)})` : `WP ${idx + 1}`,
          }));

          setWaypoints(loadedWps);
          onWaypointsChange(loadedWps);
          const distKm = (track.total_distance_meters / 1000).toFixed(2);
          setStatusMessage(`Loaded GPX: '${track.name || file.name}' (${loadedWps.length} pts, ${distKm} km)`);
        } else {
          const err = await res.json();
          setStatusMessage(`GPX Parse Error: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
        setStatusMessage('Error uploading GPX file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header and Status */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Smart Road Kinematics Simulator
        </Typography>
        <Chip
          size="small"
          label={isPlaying ? (isPaused ? 'PAUSED' : 'SERVER RUNNING') : 'STOPPED'}
          color={isPlaying ? (isPaused ? 'warning' : 'success') : 'default'}
          variant="outlined"
        />
      </Box>

      {/* Cybernetic Telemetry Needle & Heading */}
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(0, 229, 255, 0.04)', borderColor: 'rgba(0, 229, 255, 0.2)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: 'background.paper',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `rotate(${currentHeading}deg)`,
                transition: 'transform 0.4s ease-out',
              }}
            >
              <NavigationIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                Course Over Ground (COG)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', fontFamily: 'monospace' }}>
                {currentHeading.toFixed(1)}°
              </Typography>
            </Box>
          </Box>

          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Kinematic Velocity
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', fontFamily: 'monospace' }}>
              {activeSpeed.toFixed(1)} km/h ({(activeSpeed / 3.6).toFixed(1)} m/s)
            </Typography>
          </Box>
        </Box>
      </Paper>

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
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Target Velocity:</Typography>
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

      {/* Smart Routing & GPX Action Buttons */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Tooltip title="Snap waypoints to real streets and roads via OSRM">
          <Button
            size="small"
            variant="outlined"
            color="primary"
            startIcon={<AltRouteIcon />}
            onClick={handleSnapToRoads}
            disabled={waypoints.length < 2 || isSnapping}
            sx={{ flex: 1 }}
          >
            {isSnapping ? 'Snapping...' : 'Snap to Roads'}
          </Button>
        </Tooltip>

        <Tooltip title="Import a .gpx route file (Strava, Garmin, Google Maps)">
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ flex: 1 }}
          >
            Import GPX
          </Button>
        </Tooltip>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".gpx,.xml"
          onChange={handleFileUpload}
        />
      </Box>

      {/* Status banner */}
      {statusMessage && (
        <Alert severity="info" sx={{ py: 0.2, fontSize: '0.78rem' }} onClose={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}

      {/* Simulation Playback Bar */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button
          variant="contained"
          color="success"
          startIcon={isPlaying && !isPaused ? <PauseIcon /> : <PlayArrowIcon />}
          onClick={handleStartSimulation}
          disabled={waypoints.length < 2}
          sx={{ flex: 1, fontWeight: 700 }}
        >
          {isPlaying ? (isPaused ? 'Resume' : 'Pause') : 'Start Simulation'}
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={handleStopSimulation}
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
            No waypoints yet. Move the map pin and click "Add Current" or click "Import GPX".
          </Typography>
        ) : (
          <List dense disablePadding>
            {waypoints.slice(0, 100).map((wp, index) => (
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
            {waypoints.length > 100 && (
              <Typography variant="caption" sx={{ textAlign: 'center', display: 'block', color: 'text.secondary', py: 0.5 }}>
                ... and {waypoints.length - 100} more points
              </Typography>
            )}
          </List>
        )}
      </Paper>
    </Box>
  );
};
