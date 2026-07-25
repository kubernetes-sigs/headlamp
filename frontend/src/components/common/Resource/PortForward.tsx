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

import { InlineIcon } from '@iconify/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { grey } from '@mui/material/colors';
import MuiLink from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isDockerDesktop } from '../../../helpers/isDockerDesktop';
import { isElectron } from '../../../helpers/isElectron';
import { getCluster } from '../../../lib/cluster';
import {
  listPortForward,
  PortForward as PortForwardState,
  startPortForward,
  stopOrDeletePortForward,
} from '../../../lib/k8s/api/v1/portForward';
import { KubeContainer } from '../../../lib/k8s/cluster';
import { KubeObject, KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import Service from '../../../lib/k8s/service';
import ActionButton from '../ActionButton';
export { type PortForward as PortForwardState } from '../../../lib/k8s/api/v1/portForward';
import PortForwardStartDialog from '../../portforward/PortForwardStartDialog';

interface PortForwardKubeObjectProps {
  containerPort: number | string;
  resource?: KubeObject;
}

/** @deprecated Please use PortForwardKubeObjectProps for better type safety */
interface PortForwardLegacyProps {
  containerPort: number | string;
  resource?: KubeObjectInterface;
}

type PortForwardProps = PortForwardKubeObjectProps | PortForwardLegacyProps;

export const PORT_FORWARDS_STORAGE_KEY = 'portforwards';
export const PORT_FORWARD_STOP_STATUS = 'Stopped';
export const PORT_FORWARD_RUNNING_STATUS = 'Running';
export const DOCKER_DESKTOP_MIN_PORT = 30000;
export const DOCKER_DESKTOP_MAX_PORT = 32000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  if (error === null || error === undefined) {
    return '';
  }
  return String(error);
}

function getPortNumberFromPortName(containers: KubeContainer[], namedPort: string) {
  let portNumber = 0;
  containers.every((container: KubeContainer) => {
    container.ports?.find((port: { name?: string; containerPort: number }) => {
      if (port.name === namedPort) {
        portNumber = port.containerPort;
        return false;
      }
    });
    return true;
  });
  return portNumber;
}

function getPodsSelectorFilter(service?: Service) {
  if (!service) {
    return '';
  }
  const selector = service?.jsonData.spec?.selector;
  if (selector) {
    return Object.keys(service?.jsonData.spec?.selector)
      .map(item => `${item}=${selector[item]}`)
      .join(',');
  }
  return '';
}

function checkIfPodPortForwarding(portforwardParam: {
  item: PortForwardState;
  namespace: string;
  name: string;
  cluster: string;
  numericContainerPort: string | number;
}) {
  const { item, namespace, name, cluster, numericContainerPort } = portforwardParam;
  return (
    (item.namespace === namespace || item.serviceNamespace === namespace) &&
    (item.pod === name || item.service === name) &&
    item.cluster === cluster &&
    item.targetPort === numericContainerPort.toString()
  );
}

function getPortForwardsFromStorage(): PortForwardState[] {
  try {
    const portForwardsInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
    if (!portForwardsInStorage) {
      return [];
    }
    const parsed = JSON.parse(portForwardsInStorage);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((pf: unknown): pf is PortForwardState => {
      if (pf === null || typeof pf !== 'object' || Array.isArray(pf)) {
        return false;
      }
      const r = pf as Record<string, unknown>;
      return (
        typeof r.id === 'string' &&
        typeof r.pod === 'string' &&
        typeof r.service === 'string' &&
        typeof r.serviceNamespace === 'string' &&
        typeof r.namespace === 'string' &&
        typeof r.cluster === 'string' &&
        typeof r.port === 'string' &&
        typeof r.targetPort === 'string' &&
        (r.status === undefined || typeof r.status === 'string') &&
        (r.error === undefined || typeof r.error === 'string')
      );
    });
  } catch (err) {
    console.warn('Failed to parse port forwards from storage', err);
    return [];
  }
}

function PortForwardContent(props: PortForwardProps) {
  const { containerPort, resource } = props;
  const isPod = resource?.kind !== 'Service';
  const service = !isPod ? (resource as Service) : undefined;
  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';

  const [error, setError] = React.useState<string | null>(null);
  const [portForward, setPortForward] = React.useState<PortForwardState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [startDialogOpen, setStartDialogOpen] = React.useState(false);

  const { t } = useTranslation(['translation', 'resource']);

  const [pods, podsFetchError] = Pod.useList({
    namespace,
    labelSelector: getPodsSelectorFilter(service),
  });

  const cluster = React.useMemo(() => {
    if (!resource) {
      return '';
    }
    if (!!resource?.cluster) {
      return resource.cluster;
    }
    return getCluster();
  }, [resource]);

  const numericContainerPort =
    typeof containerPort === 'string' && isNaN(parseInt(containerPort))
      ? !pods || pods.length === 0
        ? 0
        : getPortNumberFromPortName(pods[0].spec.containers, containerPort)
      : containerPort;

  const displayPodName = React.useMemo(() => {
    return isPod ? name : pods && pods.length > 0 ? pods[0].metadata.name : '';
  }, [isPod, name, pods]);

  const shouldRender =
    isElectron() &&
    !(!isPod && podsFetchError) &&
    !(!isPod && (!pods || pods.length === 0)) &&
    !(isPod && (!resource || (resource as Pod).status.phase === 'Failed'));

  React.useEffect(() => {
    if (!cluster || !shouldRender) {
      return;
    }
    let cancelled = false;
    setError(null);

    listPortForward(cluster)
      .then(result => {
        if (cancelled) {
          return;
        }
        const portForwards = result || [];
        const serverAndStoragePortForwards = [...portForwards];
        const parsedPortForwards = getPortForwardsFromStorage();

        parsedPortForwards.forEach((portforward: PortForwardState) => {
          const isStoragePortForwardAvailableInServer = portForwards.find(
            (pf: PortForwardState) => pf.id === portforward.id
          );
          if (!isStoragePortForwardAvailableInServer) {
            portforward.status = PORT_FORWARD_STOP_STATUS;
            serverAndStoragePortForwards.push(portforward);
          }
        });

        for (const item of serverAndStoragePortForwards) {
          if (
            checkIfPodPortForwarding({
              item,
              namespace,
              name,
              cluster,
              numericContainerPort,
            })
          ) {
            setPortForward(item);
          }
        }

        if (!cancelled) {
          localStorage.setItem(
            PORT_FORWARDS_STORAGE_KEY,
            JSON.stringify(serverAndStoragePortForwards)
          );
        }
      })
      .catch(err => {
        if (cancelled) {
          return;
        }
        console.error('Failed to list port forwards', err);
        const message = getErrorMessage(err);
        setError(message || 'Failed to list port forwards');
      });

    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, name, numericContainerPort, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  function startPortForwardWithSelection(chosenPort?: string) {
    if (!namespace || !cluster || !pods) {
      return;
    }

    setError(null);

    const resourceName = name || '';
    const podNamespace = isPod ? namespace : pods[0].metadata.namespace!;
    const serviceNamespace = namespace;
    const serviceName = !isPod ? resourceName : '';
    const podName = isPod ? resourceName : pods![0].metadata.name;
    let port = chosenPort || portForward?.port;

    let address = 'localhost';
    if (isDockerDesktop()) {
      address = '0.0.0.0';

      if (!chosenPort && !portForward?.port) {
        const activePorts: string[] = [];
        const parsedPortForwards = getPortForwardsFromStorage();
        parsedPortForwards.forEach((pf: PortForwardState) => {
          if (pf.status === PORT_FORWARD_RUNNING_STATUS) {
            activePorts.push(pf.port);
          }
        });

        const portRange = DOCKER_DESKTOP_MAX_PORT - DOCKER_DESKTOP_MIN_PORT + 1;
        const maxAttempts = portRange;
        let attempts = 0;

        while (attempts < maxAttempts) {
          const randomPort = (
            Math.floor(Math.random() * portRange) + DOCKER_DESKTOP_MIN_PORT
          ).toString();
          if (!activePorts.includes(randomPort)) {
            port = randomPort;
            break;
          }
          attempts++;
        }

        if (!port) {
          port = Math.floor(Math.random() * portRange + DOCKER_DESKTOP_MIN_PORT).toString();
        }
      }
    }

    setLoading(true);
    startPortForward(
      cluster,
      podNamespace,
      podName,
      numericContainerPort,
      serviceName,
      serviceNamespace,
      port,
      address,
      portForward?.id
    )
      .then((data: PortForwardState) => {
        setLoading(false);
        setPortForward(data);

        const parsedPortForwards = getPortForwardsFromStorage();
        parsedPortForwards.push(data);
        localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));
      })
      .catch(error => {
        const message = getErrorMessage(error);
        setError(message || 'An unexpected error occurred.');
        setLoading(false);
        setPortForward(null);

        if (portForward?.id) {
          const parsedPortForwards = getPortForwardsFromStorage();
          const index = parsedPortForwards.findIndex(
            (pf: PortForwardState) => pf.id === portForward.id
          );
          if (index !== -1) {
            parsedPortForwards.splice(index, 1);
            localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));
          }
        }
      });
  }

  function openStartDialog() {
    setStartDialogOpen(true);
  }

  function closeStartDialog() {
    setStartDialogOpen(false);
  }

  function portForwardStopHandler() {
    if (!portForward || !cluster) {
      return;
    }
    setLoading(true);
    stopOrDeletePortForward(cluster, portForward.id, true)
      .then(() => {
        setPortForward({ ...portForward, status: PORT_FORWARD_STOP_STATUS });
      })
      .catch(error => {
        const message = getErrorMessage(error);
        setError(message || 'Failed to stop port forward');
        setPortForward(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function deletePortForwardHandler() {
    const id = portForward?.id;
    if (!cluster || !id) {
      return;
    }
    setLoading(true);
    stopOrDeletePortForward(cluster, id, false)
      .then(() => {
        const parsedPortForwards = getPortForwardsFromStorage();
        const index = parsedPortForwards.findIndex((pf: PortForwardState) => pf.id === id);
        if (index !== -1) {
          parsedPortForwards.splice(index, 1);
          localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));
        }
        setPortForward(null);
      })
      .catch(error => {
        const message = getErrorMessage(error);
        setError(message || 'Failed to delete port forward');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  const forwardBaseURL = 'http://127.0.0.1';

  return (
    <Box>
      {error && (
        <Box mb={2}>
          <Alert
            severity="error"
            onClose={() => {
              setError(null);
            }}
          >
            <Tooltip title={t('translation|Error')}>
              <Box style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{error}</Box>
            </Tooltip>
          </Alert>
        </Box>
      )}
      {!portForward ? (
        <>
          {loading ? (
            <CircularProgress size={18} />
          ) : (
            <Button
              onClick={openStartDialog}
              aria-label={t('translation|Start port forward')}
              color="primary"
              variant="outlined"
              style={{
                textTransform: 'none',
              }}
              disabled={loading}
            >
              <InlineIcon icon="mdi:fast-forward" width={20} />
              <Typography>{t('translation|Forward port')}</Typography>
            </Button>
          )}
        </>
      ) : (
        <>
          {portForward.status === PORT_FORWARD_STOP_STATUS ? (
            <Box display={'flex'} alignItems="center">
              <Typography
                style={{
                  color: grey[500],
                }}
              >{`${forwardBaseURL}:${portForward.port}`}</Typography>
              <ActionButton
                onClick={openStartDialog}
                description={t('translation|Start port forward')}
                color="primary"
                icon="mdi:fast-forward"
                iconButtonProps={{
                  size: 'small',
                  color: 'primary',
                  disabled: loading,
                }}
                width={'25'}
              />
              <ActionButton
                onClick={deletePortForwardHandler}
                description={t('translation|Delete port forward')}
                color="primary"
                icon="mdi:delete-outline"
                iconButtonProps={{
                  size: 'small',
                  color: 'primary',
                  disabled: loading,
                }}
                width={'25'}
              />
            </Box>
          ) : (
            <>
              <MuiLink
                href={`${forwardBaseURL}:${portForward.port}`}
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
              >
                {`${forwardBaseURL}:${portForward.port}`}
              </MuiLink>
              <ActionButton
                onClick={portForwardStopHandler}
                description={t('translation|Stop port forward')}
                color="primary"
                icon="mdi:stop-circle-outline"
                iconButtonProps={{
                  size: 'small',
                  color: 'primary',
                  disabled: loading,
                }}
                width={'25'}
              />
            </>
          )}
        </>
      )}
      <PortForwardStartDialog
        open={startDialogOpen}
        defaultPort={portForward?.port}
        podName={displayPodName}
        namespace={namespace}
        containerPort={numericContainerPort}
        isDockerDesktop={isDockerDesktop()}
        onCancel={closeStartDialog}
        onConfirm={portInput => {
          closeStartDialog();
          startPortForwardWithSelection(portInput);
        }}
      />
    </Box>
  );
}

export default function PortForward(props: PortForwardProps) {
  if (!isElectron()) return null;

  return <PortForwardContent {...props} />;
}
