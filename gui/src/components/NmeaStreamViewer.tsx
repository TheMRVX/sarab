import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import { apiFetch } from '../api/client';

export const NmeaStreamViewer: React.FC = () => {
  const [sentences, setSentences] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchNmea = async () => {
      try {
        const res = await apiFetch('/api/nmea/latest');
        if (res.ok) {
          const data = await res.json();
          if (data.sentences) {
            setSentences(data.sentences);
          }
        }
      } catch {
        // server offline or connecting
      }
    };

    fetchNmea();
    const interval = setInterval(fetchNmea, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(sentences.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WifiTetheringIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
            NMEA 0183 Serial & UDP Stream
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip size="small" label="UDP :10110" color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          <Tooltip title={copied ? 'Copied!' : 'Copy Sentences'}>
            <IconButton size="small" onClick={handleCopy} color="inherit">
              {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          bgcolor: '#0a0f1d',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          maxHeight: 140,
          overflowY: 'auto',
          color: '#a0aec0',
        }}
      >
        {sentences.length === 0 ? (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
            Listening for active NMEA broadcast stream...
          </Typography>
        ) : (
          sentences.map((line, idx) => (
            <Box key={idx} sx={{ py: 0.2, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#00e5ff' }}>&gt;</span> {line}
            </Box>
          ))
        )}
      </Paper>
    </Box>
  );
};
