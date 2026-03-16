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
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_POD_DEBUG_IMAGE, loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import Pod from '../../lib/k8s/pod';
import { Channel, useTerminalStream, XTerminalConnected } from '../../lib/k8s/useTerminalStream';

/**
 * Props for PodDebugTerminal.
 *
 * @property {Pod} item - Pod instance to debug
 * @property {() => void} [onClose] - Callback when terminal closes
 */
interface PodDebugTerminalProps {
  item: Pod;
  onClose?: () => void;
}

/**
 * Finds a running debug container in the pod's ephemeral containers.
 *
 * @param item - Pod to search
 * @returns Running debug container or null
 */
function findRunningDebugContainer(item: Pod): any {
  const existingEphemeralContainers = item.jsonData?.spec?.ephemeralContainers || [];
  const debugContainers = existingEphemeralContainers.filter((c: any) =>
    c.name.startsWith('headlamp-debug')
  );

  const ephemeralStatuses = item.status?.ephemeralContainerStatuses || [];

  for (const debugContainer of debugContainers) {
    const status = ephemeralStatuses.find((s: any) => s.name === debugContainer.name);
    if (status?.state?.running) {
      return debugContainer;
    }
  }

  return null;
}

/**
 * Generates a unique container name for a new debug container.
 * Appends a timestamp if 'headlamp-debug' already exists.
 *
 * @param item - Pod to check for existing names
 * @returns Unique container name
 */
function generateContainerName(item: Pod): string {
  const existingEphemeralContainers = item.jsonData?.spec?.ephemeralContainers || [];
  const debugContainers = existingEphemeralContainers.filter((c: any) =>
    c.name.startsWith('headlamp-debug')
  );

  const baseExists = debugContainers.some((c: any) => c.name === 'headlamp-debug');
  if (baseExists) {
    const timestamp = Date.now().toString(36).slice(-4);
    return `headlamp-debug-${timestamp}`;
  }

  return 'headlamp-debug';
}

/**
 * Creates an ephemeral debug container and waits for it to be ready.
 * Polls pod status up to 30 times (30 seconds) for container to reach running state.
 *
 * @param item - Pod to add ephemeral container to
 * @param containerName - Name for the new container
 * @param debugImage - Container image for debugging
 * @param onError - Error handler callback
 * @returns Object with containerName if successful, empty object on error
 */
async function debugPod(
  item: Pod,
  containerName: string,
  debugImage: string,
  onError: (message: string) => void
) {
  try {
    // Add ephemeral container to the pod
    await item.addEphemeralContainer(containerName, debugImage, ['sh']);

    // Wait for the container to be ready by polling the pod status
    const maxRetries = 30; // 30 seconds timeout
    let retries = 0;

    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh pod data
      const updatedPod: Pod = await new Promise<Pod>((resolve, reject) => {
        Pod.apiGet(
          (pod: Pod) => {
            resolve(pod);
          },
          item.getName(),
          item.getNamespace(),
          (err: any) => {
            if (err) reject(err);
          },
          {
            cluster: item.cluster || undefined,
          }
        )();
      });

      // Check if ephemeral container is running
      const ephemeralStatus = updatedPod.status?.ephemeralContainerStatuses?.find(
        (status: any) => status.name === containerName
      );

      if (ephemeralStatus?.state?.running) {
        return { containerName };
      }

      if (ephemeralStatus?.state?.terminated) {
        throw new Error(
          `Ephemeral container terminated: ${
            ephemeralStatus.state.terminated.reason || 'Unknown reason'
          }`
        );
      }

      retries++;
    }

    throw new Error('Timeout waiting for ephemeral container to start');
  } catch (e: any) {
    console.error('Error:DebugPod: creating ephemeral container', e);
    onError(e.message || 'Failed to create debug container');
    return {};
  }
}

/**
 * Terminal component for debugging pods using ephemeral containers.
 *
 * Creates or attaches to ephemeral debug containers with configurable images.
 * Reuses existing running containers and attempts cleanup on close.
 *
 * Note: Ephemeral containers cannot be removed via API and persist in pod spec.
 *
 * @param props - Pod and optional close callback
 * @returns DialogContent with embedded terminal
 */
export function PodDebugTerminal(props: PodDebugTerminalProps) {
  const { item, onClose } = props;
  const { t } = useTranslation(['translation']);
  const { enqueueSnackbar } = useSnackbar();
  const [terminalContainerRef, setTerminalContainerRef] = useState<HTMLElement | null>(null);
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);
  const containerCreatedRef = useRef(false);

  const { xtermRef, streamRef, send } = useTerminalStream({
    containerRef: terminalContainerRef,
    connectStream: async onDataCallback => {
      const cluster = getCluster();
      if (!cluster) {
        enqueueSnackbar(t('translation|No cluster selected'), { variant: 'error' });
        return { stream: null };
      }

      const clusterSettings = loadClusterSettings(cluster);
      const config = clusterSettings.podDebugTerminal;
      const debugImage = config?.debugImage || DEFAULT_POD_DEBUG_IMAGE;
      const isEnabled = config?.isEnabled ?? true;

      if (!isEnabled) {
        enqueueSnackbar(t('translation|Pod debug is disabled in settings'), {
          variant: 'error',
        });
        return { stream: null };
      }

      const runningDebugContainer = findRunningDebugContainer(item);
      let containerName: string;

      if (runningDebugContainer) {
        containerName = runningDebugContainer.name;
        containerCreatedRef.current = true;
        xtermRef.current?.xterm.writeln(
          t('translation|Attaching to existing debug container...') + '\r\n'
        );
      } else {
        containerName = generateContainerName(item);

        xtermRef.current?.xterm.writeln(t('translation|Creating ephemeral debug container...'));

        const { containerName: readyContainerName } = await debugPod(
          item,
          containerName,
          debugImage,
          (errorMessage: string) => {
            enqueueSnackbar(
              t('translation|Failed to create debug container: {{message}}', {
                message: errorMessage,
              }),
              { variant: 'error' }
            );
            xtermRef.current?.xterm.writeln(`\r\n${t('translation|Error')}: ${errorMessage}\r\n`);
          }
        );

        if (!readyContainerName) {
          return { stream: null };
        }

        containerCreatedRef.current = true;
        xtermRef.current?.xterm.writeln(t('translation|Attaching to debug container...'));
      }

      const stream = item.attach(containerName, onDataCallback, {});

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

  const sendExitIfPossible = useCallback(() => {
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
  }, [send, streamRef, exitSentRef, pendingExitRef]);

  const requestShellExit = (reason: string) => {
    if (exitSentRef.current) {
      return;
    }

    const sent = sendExitIfPossible();
    if (sent) {
      console.debug('Exit command sent to debug container', { reason });
    } else {
      console.debug('Cannot send exit - socket not ready', { reason });
      pendingExitRef.current = true;
    }
  };

  async function wrappedOnClose() {
    requestShellExit('dialog-close');

    // Note: Kubernetes doesn't allow removing ephemeral containers via API.
    // They are immutable once added and can only be removed by recreating the pod.
    // The container will remain in the pod spec but will be terminated.

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
    xterm.write(t('translation|Failed to connect…\r\n'));
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      requestShellExit('window-beforeunload');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (!exitSentRef.current && containerCreatedRef.current) {
        const sent = sendExitIfPossible();
        if (!sent) {
          console.warn(
            'Debug container may still be running. Use Ctrl+D before closing the window to ensure cleanup.'
          );
        }
      }
    };
  }, [sendExitIfPossible]);

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
      <Box sx={{ p: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t(
            'translation|Press Ctrl+D or type "exit" to terminate the ephemeral container. If you don\'t, the container will stay running.'
          )}
        </Typography>
      </Box>
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
