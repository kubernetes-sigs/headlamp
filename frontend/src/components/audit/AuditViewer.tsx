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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FixedSizeList as List } from 'react-window';
import { getCluster } from '../../lib/cluster';
import { SectionBox } from '../common';
import { PageGrid } from '../common/Resource/Resource';
import LogHighlighter from './LogHighlighter';

export interface AuditEvent {
  stageTimestamp: string;
  verb: string;
  user: { username: string };
  objectRef: { resource: string; namespace?: string; name?: string };
  responseStatus: { code: number };
  raw: string; // The raw JSON string
}

export default function AuditViewer() {
  const { t } = useTranslation(['glossary', 'frequent']);
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [verbFilter, setVerbFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // We use a ref for logs to avoid dependency issues in the WebSocket message handler if paused
  const logsRef = useRef<AuditEvent[]>([]);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const cluster = getCluster();
    if (!cluster) return;

    // Use current origin but with ws/wss protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/audit/stream?cluster=${cluster}`;

    if (userFilter) wsUrl += `&user=${encodeURIComponent(userFilter)}`;
    if (verbFilter) wsUrl += `&verb=${encodeURIComponent(verbFilter)}`;
    if (kindFilter) wsUrl += `&kind=${encodeURIComponent(kindFilter)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = event => {
      if (isPausedRef.current) return;

      try {
        const data = JSON.parse(event.data);
        const newEvent: AuditEvent = {
          stageTimestamp: data.stageTimestamp || '',
          verb: data.verb || '',
          user: data.user || { username: '' },
          objectRef: data.objectRef || { resource: '' },
          responseStatus: data.responseStatus || { code: 0 },
          raw: event.data,
        };

        // Keep max 100000 entries
        logsRef.current = [newEvent, ...logsRef.current].slice(0, 100000);
        setLogs([...logsRef.current]);
      } catch (e) {
        console.error('Error parsing audit event', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [userFilter, verbFilter, kindFilter]); // Reconnect when backend filters change

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    return log.raw.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const log = filteredLogs[index];
      const time = log.stageTimestamp || 'Unknown time';
      const user = log.user.username || 'Unknown user';
      const action = `${log.verb} ${log.objectRef.resource}`;
      const status = log.responseStatus.code ? `[${log.responseStatus.code}]` : '';

      const summary = `${time} | ${user} | ${action} | ${status}`;

      return (
        <Box
          style={{
            ...style,
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <LogHighlighter log={summary} searchTerm={searchTerm} />
        </Box>
      );
    },
    [filteredLogs, searchTerm]
  );

  return (
    <PageGrid title={t('glossary|Audit Logs')}>
      <SectionBox title="Audit Log Viewer">
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Search locally..."
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <TextField
            label="User Filter"
            variant="outlined"
            size="small"
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
          />
          <TextField
            label="Verb Filter"
            variant="outlined"
            size="small"
            value={verbFilter}
            onChange={e => setVerbFilter(e.target.value)}
          />
          <TextField
            label="Kind Filter"
            variant="outlined"
            size="small"
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
          />
          <Button variant="contained" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              logsRef.current = [];
              setLogs([]);
            }}
          >
            Clear
          </Button>
        </Stack>
        <Box sx={{ height: 600, width: '100%', bgcolor: 'background.paper' }}>
          {filteredLogs.length === 0 ? (
            <Typography sx={{ p: 2 }}>No logs to display...</Typography>
          ) : (
            <List height={600} itemCount={filteredLogs.length} itemSize={40} width="100%">
              {Row}
            </List>
          )}
        </Box>
      </SectionBox>
    </PageGrid>
  );
}
