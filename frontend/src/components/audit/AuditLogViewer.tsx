/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
} from '@mui/material';
import React, { useEffect, useRef,useState } from 'react';
import VirtualizedTable, { AuditEvent } from './VirtualizedTable';

export default function AuditLogViewer() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [regexFilter, setRegexFilter] = useState('');

  // Backend filters
  const [verbFilter, setVerbFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [verbFilter, userFilter]);

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setEvents([]);

    // Construct WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/audit?`;
    if (verbFilter) wsUrl += `verb=${verbFilter}&`;
    if (userFilter) wsUrl += `user=${userFilter}&`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = event => {
      if (!isPaused) {
        try {
          const auditEvent: AuditEvent = JSON.parse(event.data);
          setEvents(prev => [auditEvent, ...prev].slice(0, 100000)); // Keep max 100k
        } catch (e) {
          console.error('Failed to parse audit event', e);
        }
      }
    };
  };

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          color={isPaused ? 'success' : 'warning'}
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>

        <TextField
          label="Regex Highlight/Filter"
          variant="outlined"
          size="small"
          value={regexFilter}
          onChange={e => setRegexFilter(e.target.value)}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Verb</InputLabel>
          <Select value={verbFilter} label="Verb" onChange={e => setVerbFilter(e.target.value)}>
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            <MenuItem value="create">Create</MenuItem>
            <MenuItem value="update">Update</MenuItem>
            <MenuItem value="delete">Delete</MenuItem>
            <MenuItem value="get">Get</MenuItem>
            <MenuItem value="list">List</MenuItem>
            <MenuItem value="patch">Patch</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label="User"
          variant="outlined"
          size="small"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        />
      </Paper>

      <Paper sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <VirtualizedTable events={events} regexFilter={regexFilter} />
      </Paper>
    </Box>
  );
}
