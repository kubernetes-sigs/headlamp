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
import { Channel, useTerminalStream, XTerminalConnected } from '../../lib/k8s/useTerminalStream';

interface NodeShellTerminalProps {
  item: Node;
  onClose?: () => void;
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
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);

  const { xtermRef, streamRef, send } = useTerminalStream({
    containerRef: terminalContainerRef,
    connectStream: async onDataCallback => {
      xtermRef.current?.xterm.writeln('Trying to open a shell');
      const { stream } = await shell(item, onDataCallback);
      return {
        stream,
      };
    },
    onClose: wrappedOnClose,
    errorHandlers: {
      isSuccessfulExit: isSuccessfulExitError,
      isShellNotFound: isShellNotFoundError,
      onConnectionFailed: shellConnectFailed,
    },
  });

  const sendExitIfPossible = () => {
    if (exitSentRef.current) {
      return true;
    }

    const socket = streamRef.current?.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    send(Channel.StdIn, 'exit\r');
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

  function wrappedOnClose() {
    requestShellExit('dialog-close');
    if (onClose) {
      onClose();
    }
  }

  function isSuccessfulExitError(channel: number, text: string): boolean {
    // Linux container Error
    if (channel === Channel.ServerError) {
      try {
        const error = JSON.parse(text);
        if (_.isEmpty(error.metadata) && error.status === 'Success') {
          if (pendingExitRef.current && !exitSentRef.current) {
            sendExitIfPossible();
          }
          return true;
        }
      } catch {}
    }
    return false;
  }

  function isShellNotFoundError(channel: number, text: string): boolean {
    // Linux container Error
    if (channel === Channel.ServerError) {
      try {
        const error = JSON.parse(text);
        if (error.code === 500 && error.status === 'Failure' && error.reason === 'InternalError') {
          return true;
        }
      } catch {}
    }
    // Windows container Error
    if (channel === Channel.StdOut) {
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
