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

import '@xterm/xterm/css/xterm.css';
import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { getCluster } from '../../lib/cluster';
import Loader from './Loader';

export function ClusterTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const clusterName = getCluster();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || !clusterName) return;

    const isWindows = ['Windows', 'Win16', 'Win32', 'WinCE'].indexOf(navigator?.platform) >= 0;

    const xterm = new XTerminal({
      cursorBlink: true,
      cursorStyle: 'underline',
      scrollback: 10000,
      rows: 30,
      windowsMode: isWindows,
      allowProposedApi: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
      },
    });

    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);

    const resizeHandler = () => fitAddon.fit();
    window.addEventListener('resize', resizeHandler);

    // Ctrl+Shift+C to copy selection, Ctrl+Shift+V to paste.
    xterm.attachCustomKeyEventHandler(arg => {
      if (arg.ctrlKey && arg.shiftKey && arg.type === 'keydown') {
        if (arg.code === 'KeyC') {
          const selection = xterm.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
            arg.preventDefault();
            return false;
          }
        }
        if (arg.code === 'KeyV') {
          navigator.clipboard.readText().then(text => {
            const encoded = new TextEncoder().encode(text);
            socketRef.current?.send(new Uint8Array([0, ...encoded]));
          });
          arg.preventDefault();
          return false;
        }
      }
      return true;
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/wsTerminal?cluster=${clusterName}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    xterm.onResize(size => {
      const data = JSON.stringify({ Width: size.cols, Height: size.rows });
      const encoded = new TextEncoder().encode(data);
      socketRef.current?.send(new Uint8Array([4, ...encoded]));
    });

    xterm.onData(data => {
      const encoded = new TextEncoder().encode(data);
      socketRef.current?.send(new Uint8Array([0, ...encoded]));
    });

    socket.onmessage = async event => {
      const text = await event.data.text();
      xterm.write(text);
    };

    return () => {
      socket.close();
      xterm.dispose();
      window.removeEventListener('resize', resizeHandler);
    };
  }, [clusterName]);

  // Call fit() only after React has re-rendered with the terminal Box visible.
  // If we call it inside socket.onopen, the Box is still display:none and xterm
  // measures zero width, causing the broken/squished layout.
  useEffect(() => {
    if (connected && fitAddonRef.current) {
      fitAddonRef.current.fit();
    }
  }, [connected]);

  if (!clusterName) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 64px)',
          flexDirection: 'column',
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <Icon icon="mdi:console" width={48} />
        <Typography variant="h6">No cluster selected</Typography>
        <Typography variant="body2">Choose a cluster to open a terminal.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
        p: 1,
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <Icon icon="mdi:console" width={20} />
        <Typography variant="subtitle2" component="span">
          Terminal: {clusterName}
        </Typography>
      </Box>
      {!connected && <Loader title={`Connecting to ${clusterName}`} />}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: connected ? 'block' : 'none',
          bgcolor: '#1e1e1e',
          borderRadius: 1,
          p: 0.5,
          '& .xterm': {
            height: '100%',
            '& .xterm-viewport': {
              width: 'initial !important',
              bgcolor: 'transparent',
            },
          },
          '& .xterm-screen': {
            height: '100%',
          },
          '& .xterm .xterm-viewport': {
            backgroundColor: 'transparent !important',
          },
        }}
      >
        <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
      </Box>
    </Box>
  );
}
