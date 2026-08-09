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
  Typography,
} from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { getBaseWsUrl } from '../../lib/k8s/api/v2/webSocket';
import VirtualizedTable, { AuditEvent } from './VirtualizedTable';

export default function AuditLogViewer() {
  const { t } = useTranslation();
  const { cluster } = useParams<{ cluster: string }>();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);
  const [regexFilter, setRegexFilter] = useState('');

  // Backend filters
  const [verbFilter, setVerbFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const eventsBufferRef = useRef<AuditEvent[]>([]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Batch update interval to prevent UI freeze
  useEffect(() => {
    const interval = setInterval(() => {
      if (eventsBufferRef.current.length > 0) {
        setEvents(prev => {
          const newEvents = [...eventsBufferRef.current, ...prev].slice(0, 100000);
          eventsBufferRef.current = [];
          return newEvents;
        });
      }
    }, 500); // Batch update every 500ms
    return () => clearInterval(interval);
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setEvents([]);
    eventsBufferRef.current = [];

    const clusterPrefix = cluster ? `/clusters/${cluster}` : '';
    let wsUrl = `${getBaseWsUrl()}${clusterPrefix}/audit?`;

    const params = new URLSearchParams();
    if (verbFilter) params.append('verb', verbFilter);
    if (userFilter) params.append('user', userFilter);

    wsUrl += params.toString();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = event => {
      if (!isPausedRef.current) {
        try {
          const auditEvent: AuditEvent = JSON.parse(event.data);
          eventsBufferRef.current.unshift(auditEvent);
        } catch (e) {
          console.error('Failed to parse audit event', e);
        }
      }
    };
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbFilter, userFilter, cluster]);

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Typography variant="h6" color="warning.main" sx={{ mr: 2, fontWeight: 'bold' }}>
          {t('Demo/Mock Audit Logs')}
        </Typography>

        <Button
          variant="contained"
          color={isPaused ? 'success' : 'warning'}
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? t('Resume') : t('Pause')}
        </Button>

        <TextField
          label={t('Regex Highlight/Filter')}
          variant="outlined"
          size="small"
          value={regexFilter}
          onChange={e => setRegexFilter(e.target.value)}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t('Verb')}</InputLabel>
          <Select
            value={verbFilter}
            label={t('Verb')}
            onChange={e => setVerbFilter(e.target.value)}
          >
            <MenuItem value="">
              <em>{t('All')}</em>
            </MenuItem>
            <MenuItem value="create">{t('Create')}</MenuItem>
            <MenuItem value="update">{t('Update')}</MenuItem>
            <MenuItem value="delete">{t('Delete')}</MenuItem>
            <MenuItem value="get">{t('Get')}</MenuItem>
            <MenuItem value="list">{t('List')}</MenuItem>
            <MenuItem value="patch">{t('Patch')}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label={t('User')}
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
