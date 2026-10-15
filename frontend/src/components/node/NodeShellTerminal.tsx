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
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_NODE_SHELL_LINUX_IMAGE,
  DEFAULT_NODE_SHELL_NAMESPACE,
  loadClusterSettings,
} from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import Node from '../../lib/k8s/node';
import { Channel, useTerminalStream, XTerminalConnected } from '../../lib/k8s/useTerminalStream';
import store from '../../redux/stores/store';
import { createNodeShellSession, NodeShellSession } from './nodeShellSession';

interface NodeShellTerminalProps {
  item: Node;
  onClose?: () => void;
}

export function NodeShellTerminal(props: NodeShellTerminalProps) {
  const { item, onClose } = props;
  const [terminalContainerRef, setTerminalContainerRef] = useState<HTMLElement | null>(null);
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const shellSessionRef = useRef<NodeShellSession | null>(null);
  const { t } = useTranslation(['translation']);
  const { enqueueSnackbar } = useSnackbar();

  const { xtermRef, streamRef, send } = useTerminalStream({
    containerRef: terminalContainerRef,
    connectStream: async onDataCallback => {
      sessionClosedRef.current = false;
      const cluster = getCluster();
      if (!cluster) {
        const message = t('translation|No cluster selected');
        enqueueSnackbar(message, { variant: 'error' });
        return {
          stream: null,
          initialMessage: `${t('translation|Error')}: ${message}`,
        };
      }

      xtermRef.current?.xterm.writeln('Trying to open a shell');
      const clusterSettings = loadClusterSettings(cluster);
      const config = clusterSettings.nodeShellTerminal;
      const defaultNamespace = store.getState().config.defaultNodeShellNamespace;
      const defaultImage = store.getState().config.defaultNodeShellImage;
      const linuxImage = config?.linuxImage || defaultImage || DEFAULT_NODE_SHELL_LINUX_IMAGE;
      const namespace = config?.namespace || defaultNamespace || DEFAULT_NODE_SHELL_NAMESPACE;

      try {
        const session = await createNodeShellSession(
          item.getName(),
          cluster,
          namespace,
          linuxImage,
          onDataCallback,
          () => {
            sessionClosedRef.current = true;
            enqueueSnackbar(
              t('translation|Node shell connection failed; cleaning up the debug session'),
              {
                variant: 'error',
              }
            );
          },
          reportCleanupError
        );

        if (sessionClosedRef.current) {
          await session.cleanup().catch(reportCleanupError);
          return { stream: null };
        }

        shellSessionRef.current = session;
        return { stream: session.stream };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('translation|Failed to create node shell pod');
        enqueueSnackbar(t('translation|Failed to open node shell: {{message}}', { message }), {
          variant: 'error',
        });
        xtermRef.current?.xterm.writeln(`\r\n${t('translation|Error')}: ${message}\r\n`);
        return {
          stream: null,
          initialMessage: `${t('translation|Error')}: ${message}`,
        };
      }
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
    sessionClosedRef.current = true;
    requestShellExit('dialog-close');
    cleanupNodeShellSession();
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
      } catch (e) {
        console.debug('NodeShellTerminal: failed to parse server error channel data', {
          channel,
          text,
          error: e,
        });
      }
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
      } catch (e) {
        console.debug('NodeShellTerminal: failed to parse server error channel data', {
          channel,
          text,
          error: e,
        });
      }
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
    sessionClosedRef.current = true;
    cleanupNodeShellSession();
  }

  function reportCleanupError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    enqueueSnackbar(t('translation|Failed to clean up node shell: {{message}}', { message }), {
      variant: 'error',
    });
  }

  function cleanupNodeShellSession() {
    const session = shellSessionRef.current;
    if (!session) {
      return;
    }

    void session
      .cleanup()
      .then(() => {
        if (shellSessionRef.current === session) {
          shellSessionRef.current = null;
        }
      })
      .catch(reportCleanupError);
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionClosedRef.current = true;
      requestShellExit('window-beforeunload');
      cleanupNodeShellSession();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sessionClosedRef.current = true;
      cleanupNodeShellSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
