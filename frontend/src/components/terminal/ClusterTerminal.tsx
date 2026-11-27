/*
 * Copyright 2026 The Kubernetes Authors.
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

import '@xterm/xterm/css/xterm.css';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerminal } from '@xterm/xterm';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppUrl } from '../../helpers/getAppUrl';
import { getHeadlampWebSocketProtocol } from '../../helpers/getHeadlampAPIHeaders';
import { getCluster } from '../../lib/cluster';
import { getXtermTheme } from '../common/xtermTheme';

const CHANNEL_DATA = 0;
const CHANNEL_RESIZE = 4;

/**
 * Builds the /wsTerminal WebSocket URL for the active cluster.
 */
export function buildClusterTerminalWSUrl(cluster: string): string {
  const base = new URL(getAppUrl());
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanPath = base.pathname.replace(/\/+$/, '');
  base.pathname = `${cleanPath}/wsTerminal`;
  base.search = `?cluster=${encodeURIComponent(cluster)}`;
  return base.toString();
}

export default function ClusterTerminal() {
  const { t } = useTranslation();
  const muiTheme = useTheme();
  const cluster = getCluster();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed' | 'error'>(
    'connecting'
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !cluster) {
      return;
    }

    const xterm = new XTerminal({
      cursorBlink: true,
      theme: getXtermTheme(muiTheme),
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(el);
    fitAddon.fit();
    xterm.focus();

    const wsUrl = buildClusterTerminalWSUrl(cluster);
    const backendProtocol = getHeadlampWebSocketProtocol();
    const ws = backendProtocol ? new WebSocket(wsUrl, [backendProtocol]) : new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8');

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const payload = encoder.encode(JSON.stringify({ Width: xterm.cols, Height: xterm.rows }));
      const frame = new Uint8Array(payload.length + 1);
      frame[0] = CHANNEL_RESIZE;
      frame.set(payload, 1);
      ws.send(frame);
    };

    ws.onopen = () => {
      setStatus('connected');
      fitAddon.fit();
      sendResize();
    };

    ws.onmessage = event => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      if (bytes.length > 1 && bytes[0] === CHANNEL_DATA) {
        xterm.write(decoder.decode(bytes.subarray(1)));
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('closed');
    };

    const dataDisposable = xterm.onData(data => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const payload = encoder.encode(data);
      const frame = new Uint8Array(payload.length + 1);
      frame[0] = CHANNEL_DATA;
      frame.set(payload, 1);
      ws.send(frame);
    });

    const handleResize = () => {
      fitAddon.fit();
      sendResize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      dataDisposable.dispose();
      ws.close();
      xterm.dispose();
    };
  }, [cluster, muiTheme]);

  if (!cluster) {
    return (
      <Box p={2}>
        <Typography>{t('No cluster selected')}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 100px)',
        p: 2,
        gap: 1,
      }}
    >
      <Typography variant="subtitle2" color="text.secondary">
        {t('Cluster Terminal')}: {cluster} ({status})
      </Typography>
      <Box
        ref={containerRef}
        data-testid="cluster-terminal-container"
        sx={{
          flex: 1,
          minHeight: 300,
          bgcolor: 'background.paper',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      />
    </Box>
  );
}
