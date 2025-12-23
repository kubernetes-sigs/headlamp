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
import DialogContent from '@mui/material/DialogContent';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerminal } from '@xterm/xterm';
import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_NODE_SHELL_LINUX_IMAGE,
  DEFAULT_NODE_SHELL_NAMESPACE,
  loadClusterSettings,
} from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import { apply } from '../../lib/k8s/api/v1/apply';
import { stream, StreamResultsCb } from '../../lib/k8s/api/v1/streamingApi';
import Node from '../../lib/k8s/node';
import { KubePod } from '../../lib/k8s/pod';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

enum Channel {
  StdIn = 0,
  StdOut,
  StdErr,
  ServerError,
  Resize,
}

interface NodeShellTerminalProps {
  item: Node;
  onClose?: () => void;
}

interface XTerminalConnected {
  xterm: XTerminal;
  connected: boolean;
  reconnectOnEnter: boolean;
}

const shellPod = (name: string, namespace: string, nodeName: string, nodeShellImage: string) => {
  return {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name,
      namespace,
    },
    spec: {
      nodeName,
      restartPolicy: 'Never',
      terminationGracePeriodSeconds: 30,
      hostPID: true,
      hostIPC: true,
      hostNetwork: true,
      tolerations: [
        {
          operator: 'Exists',
        },
      ],
      containers: [
        {
          name: 'debugger',
          image: nodeShellImage,
          terminationMessagePolicy: 'File',
          tty: true,
          stdin: true,
          stdinOnce: true,
          volumeMounts: [
            {
              mountPath: '/host',
              name: 'host-root',
            },
          ],
        },
      ],
      volumes: [
        {
          name: 'host-root',
          hostPath: {
            path: '/',
            type: 'Directory',
          },
        },
      ],
    },
  } as unknown as KubePod;
};

function uniqueString() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  let res = '';

  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(Math.random() * alphabet.length);
    res += alphabet[idx];
  }

  return res;
}

async function shell(item: Node, onExec: StreamResultsCb) {
  const cluster = getCluster();
  if (!cluster) {
    return {};
  }

  const clusterSettings = loadClusterSettings(cluster);
  const config = clusterSettings.nodeShellTerminal;
  const linuxImage = config?.linuxImage || DEFAULT_NODE_SHELL_LINUX_IMAGE;
  const namespace = config?.namespace || DEFAULT_NODE_SHELL_NAMESPACE;
  const podName = `node-debugger-${item.getName()}-${uniqueString()}`;
  const kubePod = shellPod(podName, namespace, item.getName(), linuxImage);
  try {
    await apply(kubePod);
  } catch (e) {
    console.error('Error:DebugNode: creating pod', e);
    return {};
  }
  const tty = true;
  const stdin = true;
  const stdout = true;
  const stderr = true;
  const url = `/api/v1/namespaces/${namespace}/pods/${podName}/attach?container=debugger&stdin=${
    stdin ? 1 : 0
  }&stderr=${stderr ? 1 : 0}&stdout=${stdout ? 1 : 0}&tty=${tty ? 1 : 0}`;
  const additionalProtocols = [
    'v4.channel.k8s.io',
    'v3.channel.k8s.io',
    'v2.channel.k8s.io',
    'channel.k8s.io',
  ];
  return {
    stream: stream(url, onExec, { additionalProtocols, isJson: false }),
  };
}

export function NodeShellTerminal(props: NodeShellTerminalProps) {
  const { item, onClose } = props;
  const [terminalContainerRef, setTerminalContainerRef] = useState<HTMLElement | null>(null);
  const xtermRef = useRef<XTerminalConnected | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const streamRef = useRef<any | null>(null);
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);

  const sendExitIfPossible = () => {
    if (exitSentRef.current) {
      return true;
    }

    const socket = streamRef.current?.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    send(0, 'exit\r');
    exitSentRef.current = true;
    pendingExitRef.current = false;
    setTimeout(() => streamRef.current?.cancel(), 1000);
    return true;
  };

  const requestShellExit = (reason: string) => {
    if (exitSentRef.current) {
      return;
    }

    const sent = sendExitIfPossible();
    if (!sent) {
      console.debug('Queueing exit for shell (not yet connected)', { reason });
      pendingExitRef.current = true;
    } else {
      console.debug('Exit command sent to shell', { reason });
    }
  };

  const wrappedOnClose = () => {
    requestShellExit('dialog-close');
    if (!!onClose) {
      onClose();
    }
  };

  // @todo: Give the real exec type when we have it.
  function setupTerminal(containerRef: HTMLElement, xterm: XTerminal, fitAddon: FitAddon) {
    if (!containerRef) {
      return;
    }

    xterm.open(containerRef);

    let lastKeyPressEvent: KeyboardEvent | null = null;
    xterm.onData(data => {
      let dataToSend = data;

      // On MacOS with a German layout, the Alt+7 should yield a | character, but
      // the onData event doesn't get it. So we need to add a custom key handler.
      // No need to check for the actual platform because the key patterns should
      // be good enough.
      if (
        data === '\u001b7' &&
        lastKeyPressEvent?.key === '|' &&
        lastKeyPressEvent.code === 'Digit7'
      ) {
        dataToSend = '|';
      }

      send(0, dataToSend);
    });

    xterm.onResize(size => {
      send(4, `{"Width":${size.cols},"Height":${size.rows}}`);
    });

    // Allow copy/paste in terminal
    xterm.attachCustomKeyEventHandler(arg => {
      if (arg.type === 'keydown') {
        lastKeyPressEvent = arg;
      } else {
        lastKeyPressEvent = null;
      }

      if (arg.ctrlKey && arg.type === 'keydown') {
        if (arg.code === 'KeyC') {
          const selection = xterm.getSelection();
          if (selection) {
            return false;
          }
        }
        if (arg.code === 'KeyV') {
          return false;
        }
      }

      return true;
    });

    fitAddon.fit();
  }

  function send(channel: number, data: string) {
    const socket = streamRef.current!.getSocket();

    // We should only send data if the socket is ready.
    if (!socket || socket.readyState !== 1) {
      console.debug('Could not send data to exec: Socket not ready...', socket);
      return;
    }

    const encoded = encoder.encode(data);
    const buffer = new Uint8Array([channel, ...encoded]);

    socket.send(buffer);
  }

  function onData(xtermc: XTerminalConnected, bytes: ArrayBuffer) {
    const xterm = xtermc.xterm;
    // Only show data from stdout, stderr and server error channel.
    const channel: Channel = new Int8Array(bytes.slice(0, 1))[0];
    if (channel < Channel.StdOut || channel > Channel.ServerError) {
      return;
    }

    // The first byte is discarded because it just identifies whether
    // this data is from stderr, stdout, or stdin.
    const data = bytes.slice(1);
    const text = decoder.decode(data);

    // Send resize command to server once connection is establised.
    if (!xtermc.connected) {
      xterm.clear();
      (async function () {
        send(4, `{"Width":${xterm.cols},"Height":${xterm.rows}}`);
      })();
      // On server error, don't set it as connected
      if (channel !== Channel.ServerError) {
        xtermc.connected = true;
        console.debug('Terminal is now connected');
        if (pendingExitRef.current && !exitSentRef.current) {
          sendExitIfPossible();
        }
      }
    }

    if (isSuccessfulExitError(channel, text)) {
      wrappedOnClose();

      if (streamRef.current) {
        streamRef.current?.cancel();
      }

      return;
    }

    if (isShellNotFoundError(channel, text)) {
      shellConnectFailed(xtermc);
      return;
    }
    xterm.write(text);
  }

  function isSuccessfulExitError(channel: number, text: string): boolean {
    // Linux container Error
    if (channel === 3) {
      try {
        const error = JSON.parse(text);
        if (_.isEmpty(error.metadata) && error.status === 'Success') {
          return true;
        }
      } catch {}
    }
    return false;
  }

  function isShellNotFoundError(channel: number, text: string): boolean {
    // Linux container Error
    if (channel === 3) {
      try {
        const error = JSON.parse(text);
        if (error.code === 500 && error.status === 'Failure' && error.reason === 'InternalError') {
          return true;
        }
      } catch {}
    }
    // Windows container Error
    if (channel === 1) {
      if (text.includes('The system cannot find the file specified')) {
        return true;
      }
    }
    return false;
  }

  function shellConnectFailed(xtermc: XTerminalConnected) {
    const xterm = xtermc.xterm;
    xterm.clear();
    xterm.write('Failed to connect…\r\n');
  }

  useEffect(
    () => {
      // We need a valid container ref for the terminal to add itself to it.
      if (terminalContainerRef === null) {
        return;
      }

      if (xtermRef.current) {
        xtermRef.current.xterm.dispose();
        streamRef.current?.cancel();
      }

      xtermRef.current = {
        xterm: new XTerminal({
          cursorBlink: true,
          cursorStyle: 'underline',
          scrollback: 10000,
          rows: 30, // initial rows before fit
          windowsMode: false,
          allowProposedApi: true,
        }),
        connected: false,
        reconnectOnEnter: false,
      };

      fitAddonRef.current = new FitAddon();
      xtermRef.current.xterm.loadAddon(fitAddonRef.current);

      (async function () {
        xtermRef?.current?.xterm.writeln('Trying to open a shell');
        const { stream } = await shell(item, (items: ArrayBuffer) =>
          onData(xtermRef.current!, items)
        );
        streamRef.current = stream;

        setupTerminal(terminalContainerRef, xtermRef.current!.xterm, fitAddonRef.current!);
      })();

      const handler = () => {
        fitAddonRef.current!.fit();
      };

      window.addEventListener('resize', handler);

      return function cleanup() {
        requestShellExit('component-unmount');
        xtermRef.current?.xterm.dispose();
        streamRef.current?.cancel();
        window.removeEventListener('resize', handler);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [terminalContainerRef]
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      requestShellExit('window-beforeunload');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <DialogContent
      sx={theme => ({
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        '& .xterm ': {
          height: '100vh', // So the terminal doesn't stay shrunk when shrinking vertically and maximizing again.
          '& .xterm-viewport': {
            width: 'initial !important', // BugFix: https://github.com/xtermjs/xterm.js/issues/3564#issuecomment-1004417440
          },
        },
        '& #xterm-container': {
          overflow: 'hidden',
          width: '100%',
          '& .terminal.xterm': {
            padding: theme.spacing(1),
          },
        },
      })}
    >
      <Box
        sx={theme => ({
          paddingTop: theme.spacing(1),
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column-reverse',
        })}
      >
        <div
          id="xterm-container"
          ref={x => setTerminalContainerRef(x)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse' }}
        />
      </Box>
    </DialogContent>
  );
}
