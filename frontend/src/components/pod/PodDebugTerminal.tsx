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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_POD_DEBUG_IMAGE, loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import { KubeContainer, KubeContainerStatus } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import {
  Channel,
  isRetryableStartError,
  useTerminalStream,
  XTerminalConnected,
} from '../../lib/k8s/useTerminalStream';
import { useTypedSelector } from '../../redux/hooks';

/**
 * Props for PodDebugTerminal.
 *
 * @property {Pod} item - Pod instance to debug
 * @property {string} [targetContainer] - Optional target container name to share PID namespace with
 * @property {() => void} [onClose] - Callback when terminal closes
 */
interface PodDebugTerminalProps {
  item: Pod;
  targetContainer?: string;
  onClose?: () => void;
}

/**
 * Finds a running debug container in the pod's ephemeral containers
 * that matches the requested target container.
 *
 * @param item - Pod to search
 * @param targetContainerName - The target container name to match.
 *   If undefined, matches containers with no target set.
 * @returns Running debug container matching the target, or null
 */
function findRunningDebugContainer(item: Pod, targetContainerName?: string): KubeContainer | null {
  const existingEphemeralContainers = item.jsonData?.spec?.ephemeralContainers || [];
  const debugContainers = existingEphemeralContainers.filter((c: KubeContainer) =>
    c.name.startsWith('headlamp-debug')
  );

  const ephemeralStatuses = item.status?.ephemeralContainerStatuses || [];

  for (const debugContainer of debugContainers) {
    const status = ephemeralStatuses.find(
      (s: KubeContainerStatus) => s.name === debugContainer.name
    );
    if (status?.state?.running && debugContainer.targetContainerName === targetContainerName) {
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
 * A container still starting after that, e.g. pulling its image, is attached to all
 * the same, as the terminal keeps trying until it runs.
 *
 * @param item - Pod to add ephemeral container to
 * @param containerName - Name for the new container
 * @param debugImage - Container image for debugging
 * @param onError - Error handler callback
 * @param targetContainerName - Optional name of the container to target.
 *   When set, the debug container shares the target's PID namespace.
 *   If undefined, no targeting is applied.
 * @returns Object with containerName if successful, or whether adding the container can
 *   be retried
 */
export async function debugPod(
  item: Pod,
  containerName: string,
  debugImage: string,
  onError: (message: string) => void,
  targetContainerName?: string
): Promise<{ containerName?: string; retry?: boolean }> {
  let added = false;
  try {
    // Add ephemeral container to the pod
    await item.addEphemeralContainer(containerName, debugImage, ['sh'], targetContainerName);
    added = true;

    // Wait for the container to be ready by polling the pod status
    const maxRetries = 30; // 30 seconds timeout
    let retries = 0;

    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh pod data. A poll that fails, e.g. during a short network drop, is
      // skipped, as the wait ends with attaching to the container anyway. A pod that
      // is gone or can't be read is final.
      const updatedPod = await new Promise<Pod | null>((resolve, reject) => {
        Pod.apiGet(
          (pod: Pod) => {
            resolve(pod);
          },
          item.getName(),
          item.getNamespace(),
          (err: any) => {
            if (err?.status === 404 || err?.status === 403) {
              reject(err);
            } else if (err) {
              console.debug('DebugPod: polling the pod failed', err);
              resolve(null);
            }
          },
          {
            cluster: item.cluster || undefined,
          }
        )();
      });

      // Check if ephemeral container is running
      const ephemeralStatus = updatedPod?.status?.ephemeralContainerStatuses?.find(
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

    return { containerName };
  } catch (e: any) {
    console.error('Error:DebugPod: creating ephemeral container', e);
    onError(e.message || 'Failed to create debug container');
    // Only adding the container is tried again; one that terminated is final.
    return added ? {} : { retry: isRetryableStartError(e) };
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
  const { item, targetContainer, onClose } = props;
  const { t } = useTranslation(['translation']);
  const { enqueueSnackbar } = useSnackbar();
  const [terminalContainerRef, setTerminalContainerRef] = useState<HTMLElement | null>(null);
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);
  const containerCreatedRef = useRef(false);
  const defaultPodDebugImage = useTypedSelector(state => state.config.defaultPodDebugImage);
  const defaultPodDebugImageRef = useRef(defaultPodDebugImage);
  const debugContainerNameRef = useRef<string | null>(null);
  // The last failure to add the container that was reported, so retries stay quiet.
  const reportedErrorRef = useRef('');
  const onCloseRef = useRef<() => void>(() => {});
  const isSuccessfulExitRef = useRef<(channel: number, text: string) => boolean>(() => false);
  const isShellNotFoundRef = useRef<(channel: number, text: string) => boolean>(() => false);
  const shellConnectFailedRef = useRef<(xtermc: XTerminalConnected) => void>(() => {});

  useEffect(() => {
    defaultPodDebugImageRef.current = defaultPodDebugImage;
  }, [defaultPodDebugImage]);

  const connectStream = useCallback(
    async (onDataCallback: (data: ArrayBuffer) => void) => {
      // The pod's cluster and its settings, not the current page's: the terminal
      // stays open, and reconnects, while the user goes elsewhere.
      const cluster = item.cluster || getCluster();
      if (!cluster) {
        enqueueSnackbar(t('translation|No cluster selected'), { variant: 'error' });
        return { stream: null };
      }

      const clusterSettings = loadClusterSettings(cluster);
      const config = clusterSettings.podDebugTerminal;
      const debugImage =
        config?.debugImage || defaultPodDebugImageRef.current || DEFAULT_POD_DEBUG_IMAGE;
      const isEnabled = config?.isEnabled ?? true;

      if (!isEnabled) {
        enqueueSnackbar(t('translation|Pod debug is disabled in settings'), {
          variant: 'error',
        });
        return { stream: null };
      }

      const runningDebugContainer = findRunningDebugContainer(item, targetContainer);
      let containerName: string;

      if (runningDebugContainer) {
        containerName = runningDebugContainer.name;
        debugContainerNameRef.current = containerName;
        containerCreatedRef.current = true;
        xtermRef.current?.xterm.writeln(t('translation|Attaching to existing debug container...'));
      } else if (containerCreatedRef.current && debugContainerNameRef.current) {
        // Reconnecting: the terminal already shows the reconnect progress.
        containerName = debugContainerNameRef.current;
      } else {
        // A retry adds the same container. If an attempt whose response was lost added
        // it, the retry sends the same list of ephemeral containers, which changes
        // nothing, so it cannot add a second one.
        if (!debugContainerNameRef.current) {
          debugContainerNameRef.current = generateContainerName(item);
          xtermRef.current?.xterm.writeln(t('translation|Creating ephemeral debug container...'));
          if (targetContainer) {
            xtermRef.current?.xterm.writeln(
              t('translation|Targeting container: {{container}}', { container: targetContainer })
            );
          }
        }
        containerName = debugContainerNameRef.current;

        const { containerName: readyContainerName, retry } = await debugPod(
          item,
          containerName,
          debugImage,
          (errorMessage: string) => {
            if (errorMessage === reportedErrorRef.current) return;
            reportedErrorRef.current = errorMessage;
            enqueueSnackbar(
              t('translation|Failed to create debug container: {{message}}', {
                message: errorMessage,
              }),
              { variant: 'error' }
            );
            xtermRef.current?.xterm.writeln(`\r\n${t('translation|Error')}: ${errorMessage}\r\n`);
          },
          targetContainer
        );

        if (!readyContainerName) {
          return { stream: null, retry };
        }

        containerCreatedRef.current = true;
        xtermRef.current?.xterm.writeln(t('translation|Attaching to debug container...'));
      }

      const stream = item.attach(containerName, onDataCallback, { multiplexed: true });

      return {
        stream,
      };
    },
    // xtermRef is a stable ref object from useTerminalStream — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enqueueSnackbar, item, t, targetContainer]
  );

  const errorHandlers = useMemo(
    () => ({
      isSuccessfulExit: (channel: number, text: string) =>
        isSuccessfulExitRef.current(channel, text),
      isShellNotFound: (channel: number, text: string) => isShellNotFoundRef.current(channel, text),
      onConnectionFailed: (xtermc: XTerminalConnected) => shellConnectFailedRef.current(xtermc),
    }),
    []
  );
  const handleTerminalClose = useCallback(() => onCloseRef.current(), []);

  const { xtermRef, streamRef, send } = useTerminalStream({
    containerRef: terminalContainerRef,
    connectStream,
    onClose: handleTerminalClose,
    errorHandlers,
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
      } catch (e) {
        console.debug('PodDebugTerminal: failed to parse server error channel data', {
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
        console.debug('PodDebugTerminal: failed to parse server error channel data', {
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
    xterm.write(t('translation|Failed to connect…\r\n'));
  }

  onCloseRef.current = wrappedOnClose;
  isSuccessfulExitRef.current = isSuccessfulExitError;
  isShellNotFoundRef.current = isShellNotFoundError;
  shellConnectFailedRef.current = shellConnectFailed;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
