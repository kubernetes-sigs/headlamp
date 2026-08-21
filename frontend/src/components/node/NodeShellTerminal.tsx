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
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addBackstageAuthHeaders } from '../../helpers/addBackstageAuthHeaders';
import {
  DEFAULT_NODE_SHELL_LINUX_IMAGE,
  DEFAULT_NODE_SHELL_NAMESPACE,
  loadClusterSettings,
} from '../../helpers/clusterSettings';
import { getAppUrl } from '../../helpers/getAppUrl';
import { getCluster } from '../../lib/cluster';
import { apply } from '../../lib/k8s/api/v1/apply';
import { combinePath } from '../../lib/k8s/api/v1/formatUrl';
import { stream, StreamResultsCb } from '../../lib/k8s/api/v1/streamingApi';
import { remove } from '../../lib/k8s/apiProxy';
import Node from '../../lib/k8s/node';
import { KubePod } from '../../lib/k8s/pod';
import { Channel, useTerminalStream, XTerminalConnected } from '../../lib/k8s/useTerminalStream';
import store from '../../redux/stores/store';
import { findKubeconfigByClusterName } from '../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../stateless/getUserIdFromLocalStorage';

interface NodeShellTerminalProps {
  item: Node;
  onClose?: () => void;
}

const shellPod = (
  name: string,
  namespace: string,
  nodeName: string,
  nodeShellImage: string,
  command: string[] = ['sh']
) => {
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
          command,
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

/**
 * Creates the node debugger pod and opens an attach stream to it.
 *
 * @param item - Node to open a shell on
 * @param cluster - Cluster the node belongs to, already resolved by the caller
 * @param podName - Name of the pod to be created
 * @param namespace - Namespace to create the pod in
 * @param onExec - Stream results callback
 * @param onError - Error handler callback, called with the pod creation failure message when the
 *                  thrown value carries one, and with undefined otherwise so the caller can supply a
 *                  translated fallback
 * @param failCb - Callback invoked when the socket stream fails
 * @returns Object with the stream if successful, empty object on error
 */
async function shell(
  item: Node,
  cluster: string,
  podName: string,
  namespace: string,
  onExec: StreamResultsCb,
  onError: (message?: string) => void,
  failCb?: () => void,
  connectCb?: () => void
) {
  const clusterSettings = loadClusterSettings(cluster);
  const config = clusterSettings.nodeShellTerminal;
  const defaultImage = store.getState().config.defaultNodeShellImage;
  const linuxImage = config?.linuxImage || defaultImage || DEFAULT_NODE_SHELL_LINUX_IMAGE;
  const kubePod = shellPod(podName, namespace, item.getName(), linuxImage);
  try {
    await apply(kubePod, cluster);
  } catch (e) {
    console.error('Error:DebugNode: creating pod', e);
    onError(e instanceof Error ? e.message : undefined);
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
    stream: stream(url, onExec, {
      additionalProtocols,
      isJson: false,
      cluster,
      failCb,
      connectCb,
      reconnectOnFailure: true,
    }),
  };
}

export function NodeShellTerminal(props: NodeShellTerminalProps) {
  const { item, onClose } = props;
  const [terminalContainerRef, setTerminalContainerRef] = useState<HTMLElement | null>(null);
  const exitSentRef = useRef(false);
  const pendingExitRef = useRef(false);
  const shellPodInfoRef = useRef<{ podName: string; namespace: string; cluster: string } | null>(
    null
  );
  const preResolvedCleanupInfoRef = useRef<
    Record<string, { url: string; headers: Record<string, string> }>
  >({});
  const unmountedRef = useRef(false);
  const deletingPodRef = useRef<string | null>(null);
  const connectionVersionRef = useRef(0);
  const localStreamRef = useRef<any | null>(null);
  const { t } = useTranslation(['translation']);
  const { enqueueSnackbar } = useSnackbar();

  const onCloseRef = useRef<() => void>(() => {});
  const isSuccessfulExitRef = useRef<(channel: number, text: string) => boolean>(() => false);
  const isShellNotFoundRef = useRef<(channel: number, text: string) => boolean>(() => false);
  const shellConnectFailedRef = useRef<(xtermc: XTerminalConnected) => void>(() => {});
  const terminalRef = useRef<MutableRefObject<XTerminalConnected | null> | null>(null);

  const deletePod = useCallback(
    async (namespace: string, podName: string, clusterName?: string) => {
      const resolvedCluster = clusterName || item.cluster || getCluster() || undefined;
      const compositeKey = `${resolvedCluster || ''}:${namespace}:${podName}`;
      if (deletingPodRef.current === compositeKey) {
        return;
      }
      deletingPodRef.current = compositeKey;
      try {
        const preResolved = preResolvedCleanupInfoRef.current[compositeKey];
        if (preResolved) {
          const { url, headers } = preResolved;
          const response = await fetch(url, { method: 'DELETE', headers, keepalive: true });
          if (!response.ok) {
            throw new Error(`DELETE failed with status ${response.status}: ${response.statusText}`);
          }
          delete preResolvedCleanupInfoRef.current[compositeKey];
        } else {
          const podUrl = `/api/v1/namespaces/${namespace}/pods/${podName}`;
          await remove(podUrl, { cluster: resolvedCluster, keepalive: true });
        }
        if (shellPodInfoRef.current?.podName === podName) {
          shellPodInfoRef.current = null;
        }
      } catch (err) {
        console.error('Failed to delete node shell pod:', err);
      } finally {
        deletingPodRef.current = null;
      }
    },
    [item]
  );

  const connectStream = useCallback(
    async (onDataCallback: (data: ArrayBuffer) => void) => {
      const version = ++connectionVersionRef.current;

      const cluster = item.cluster || getCluster();
      if (!cluster) {
        const message = t('translation|No cluster selected');
        enqueueSnackbar(message, { variant: 'error' });
        return {
          stream: null,
          initialMessage: `${t('translation|Error')}: ${message}`,
        };
      }

      const podName = `node-debugger-${item.getName()}-${uniqueString()}`;
      const defaultNamespace = store.getState().config.defaultNodeShellNamespace;
      const clusterSettings = loadClusterSettings(cluster);
      const config = clusterSettings.nodeShellTerminal;
      const namespace = config?.namespace || defaultNamespace || DEFAULT_NODE_SHELL_NAMESPACE;

      // Pre-resolve cleanup request URL and headers asynchronously for synchronous window unload deletion
      const resolveCleanup = async () => {
        try {
          const resolvedCluster = cluster || undefined;
          const podPath = `/api/v1/namespaces/${namespace}/pods/${podName}`;
          let fullPath = podPath;
          let headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (resolvedCluster) {
            const kubeconfig = await findKubeconfigByClusterName(resolvedCluster);
            if (kubeconfig !== null) {
              headers['KUBECONFIG'] = kubeconfig;
              headers['X-HEADLAMP-USER-ID'] = getUserIdFromLocalStorage();
            }
            fullPath = combinePath(`/clusters/${resolvedCluster}`, podPath);
          }
          headers = addBackstageAuthHeaders(headers) as Record<string, string>;
          const compositeKey = `${resolvedCluster || ''}:${namespace}:${podName}`;
          preResolvedCleanupInfoRef.current[compositeKey] = {
            url: combinePath(getAppUrl(), fullPath),
            headers,
          };
        } catch (e) {
          console.error('Failed to pre-resolve cleanup request info:', e);
        }
      };
      resolveCleanup();

      terminalRef.current?.current?.xterm.writeln('Trying to open a shell');

      // streamContainer is a mutable ref-like object that will be updated immediately
      // after the stream is created inside shell(). This allows the synchronous handleFail
      // (which may fire during stream construction) to cancel the stream.
      const streamContainer = { current: null as any };
      let failed = false;
      let failCount = 0;
      const MAX_CONNECTION_ATTEMPTS = 10;

      const handleFail = () => {
        if (version !== connectionVersionRef.current) {
          return;
        }

        if (terminalRef.current?.current?.connected) {
          if (failCount === 0) {
            terminalRef.current.current.xterm.writeln(
              `\r\n${t('translation|Connection lost. Retrying...')}\r\n`
            );
          }
        }

        failCount++;
        if (failCount < MAX_CONNECTION_ATTEMPTS) {
          if (!terminalRef.current?.current?.connected) {
            // Print wait message and let the stream keep retrying
            terminalRef.current?.current?.xterm.writeln(
              t(
                'translation|Waiting for debugger container to be ready (attempt {{failCount}}/{{MAX_CONNECTION_ATTEMPTS}})...',
                { failCount, MAX_CONNECTION_ATTEMPTS }
              )
            );
          }
          return;
        }

        failed = true;
        streamContainer.current?.cancel?.();
        localStreamRef.current?.cancel?.();
        deletePod(namespace, podName, cluster);
        terminalRef.current?.current?.xterm.writeln(
          `\r\n${t('translation|Error')}: ${t(
            'translation|Failed to connect to the debugger container after multiple attempts.'
          )}\r\n`
        );
      };

      const wrappedOnDataCallback = (data: ArrayBuffer) => {
        const channel: Channel = new Int8Array(data.slice(0, 1))[0];
        if (channel === Channel.StdOut || channel === Channel.StdErr) {
          failCount = 0;
        }
        onDataCallback(data);
      };

      const handleConnect = () => {
        setTimeout(() => {
          const socket = streamContainer.current?.getSocket();
          if (socket) {
            socket.addEventListener('open', () => {
              failCount = 0;
            });
            if (socket.readyState === WebSocket.OPEN) {
              failCount = 0;
            }
          }
        }, 0);
      };

      const { stream } = await shell(
        item,
        cluster,
        podName,
        namespace,
        wrappedOnDataCallback,
        (errorMessage?: string) => {
          const message = errorMessage || t('translation|Failed to create node shell pod');
          enqueueSnackbar(t('translation|Failed to open node shell: {{message}}', { message }), {
            variant: 'error',
          });
          terminalRef.current?.current?.xterm.writeln(
            `\r\n${t('translation|Error')}: ${message}\r\n`
          );
        },
        handleFail,
        handleConnect
      );

      if (stream) {
        streamContainer.current = stream;

        if (version !== connectionVersionRef.current || failed) {
          stream.cancel?.();
          deletePod(namespace, podName, cluster);
          return { stream };
        }

        localStreamRef.current = stream;

        if (unmountedRef.current) {
          // Component already unmounted while pod was being created — stop stream retries and delete immediately
          stream.cancel?.();
          deletePod(namespace, podName, cluster);
        } else {
          if (shellPodInfoRef.current && shellPodInfoRef.current.podName !== podName) {
            const {
              podName: oldPodName,
              namespace: oldNamespace,
              cluster: oldCluster,
            } = shellPodInfoRef.current;
            deletePod(oldNamespace, oldPodName, oldCluster);
          }
          shellPodInfoRef.current = { podName, namespace, cluster };
        }
      }

      return {
        stream,
      };
    },
    [item, deletePod, localStreamRef, t, enqueueSnackbar]
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

  const { xtermRef, send } = useTerminalStream({
    containerRef: terminalContainerRef,
    connectStream,
    onClose: handleTerminalClose,
    errorHandlers,
  });

  const sendExitIfPossible = useCallback(() => {
    if (exitSentRef.current) {
      return true;
    }

    const socket = localStreamRef.current?.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    send(Channel.StdIn, 'exit\r');
    exitSentRef.current = true;
    pendingExitRef.current = false;
    setTimeout(() => localStreamRef.current?.cancel(), 1000);
    return true;
  }, [send, localStreamRef]);

  const requestShellExit = useCallback(
    (reason: string) => {
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
    },
    [sendExitIfPossible]
  );

  const deletePodRef = useRef(deletePod);
  const requestShellExitRef = useRef(requestShellExit);

  const wrappedOnClose = useCallback(() => {
    requestShellExit('dialog-close');

    if (shellPodInfoRef.current) {
      const { podName, namespace, cluster } = shellPodInfoRef.current;
      deletePod(namespace, podName, cluster);
    }

    if (onClose) {
      onClose();
    }
  }, [deletePod, onClose, requestShellExit]);

  const isSuccessfulExitError = useCallback(
    (channel: number, text: string): boolean => {
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
    },
    [sendExitIfPossible]
  );

  const isShellNotFoundError = useCallback((channel: number, text: string): boolean => {
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
    if (channel === Channel.StdOut) {
      if (text.includes('The system cannot find the file specified')) {
        return true;
      }
    }
    return false;
  }, []);

  const shellConnectFailed = useCallback(
    (xtermc: XTerminalConnected) => {
      const xterm = xtermc.xterm;
      xterm.clear();
      xterm.write('Failed to connect…\r\n');

      localStreamRef.current?.cancel();
      if (shellPodInfoRef.current) {
        const { podName, namespace, cluster } = shellPodInfoRef.current;
        deletePod(namespace, podName, cluster);
      }
    },
    [deletePod, localStreamRef]
  );

  terminalRef.current = xtermRef;
  onCloseRef.current = wrappedOnClose;
  isSuccessfulExitRef.current = isSuccessfulExitError;
  isShellNotFoundRef.current = isShellNotFoundError;
  shellConnectFailedRef.current = shellConnectFailed;
  deletePodRef.current = deletePod;
  requestShellExitRef.current = requestShellExit;

  useEffect(() => {
    const handleBeforeUnload = () => {
      requestShellExitRef.current('window-beforeunload');
      if (shellPodInfoRef.current) {
        const { podName, namespace, cluster } = shellPodInfoRef.current;
        const compositeKey = `${cluster || ''}:${namespace}:${podName}`;
        const preResolved = preResolvedCleanupInfoRef.current[compositeKey];
        if (preResolved) {
          const { url, headers } = preResolved;
          fetch(url, { method: 'DELETE', headers, keepalive: true });
        } else {
          deletePodRef.current(namespace, podName, cluster);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (shellPodInfoRef.current) {
        const { podName, namespace, cluster } = shellPodInfoRef.current;
        deletePodRef.current(namespace, podName, cluster);
      }
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
