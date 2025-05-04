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
import { Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material';
import { Alert } from '@mui/material';
import { grey } from '@mui/material/colors';
import MuiLink from '@mui/material/Link';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isDockerDesktop } from '../../../helpers/isDockerDesktop';
import { isElectron } from '../../../helpers/isElectron';
import { getCluster } from '../../../lib/cluster';
import { PortForward as PortForwardState } from '../../../lib/k8s/api/v1/portForward';
import {
  listPortForward,
  startPortForward,
  stopOrDeletePortForward,
} from '../../../lib/k8s/apiProxy';
import { KubeContainer } from '../../../lib/k8s/cluster';
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import Service from '../../../lib/k8s/service';
import ActionButton from '../ActionButton';
export { type PortForward as PortForwardState } from '../../../lib/k8s/api/v1/portForward';

interface PortForwardProps {
  containerPort: number | string;
  resource?: KubeObjectInterface;
}

export const PORT_FORWARDS_STORAGE_KEY = 'portforwards';
export const PORT_FORWARD_STOP_STATUS = 'Stopped';
export const PORT_FORWARD_RUNNING_STATUS = 'Running';

function getPortNumberFromPortName(containers: KubeContainer[], namedPort: string) {
  let portNumber = 0;
  containers.every((container: KubeContainer) => {
    container.ports?.find((port: any) => {
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
  item: any;
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

function PortForwardContent(props: PortForwardProps) {
  const { containerPort, resource } = props;
  const isPod = resource?.kind !== 'Service';
  const service = !isPod ? (resource as Service) : undefined;
  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const [error, setError] = React.useState(null);
  const [portForward, setPortForward] = React.useState<PortForwardState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const cluster = getCluster();
  const { t } = useTranslation(['translation', 'resource']);
  const [pods, podsFetchError] = Pod.useList({
    namespace,
    labelSelector: getPodsSelectorFilter(service),
  });

  if (service && podsFetchError && !pods) {
    return null;
  }

  const numericContainerPort =
    typeof containerPort === 'string' && isNaN(parseInt(containerPort))
      ? !pods || pods.length === 0
        ? 0
        : getPortNumberFromPortName(pods[0].spec.containers, containerPort)
      : containerPort;

  React.useEffect(() => {
    if (!cluster) {
      return;
    }
    listPortForward(cluster).then(result => {
      const portForwards = result || [];
      const serverAndStoragePortForwards = [...portForwards];
      const portForwardsInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
      const parsedPortForwards = JSON.parse(portForwardsInStorage || '[]');

      parsedPortForwards.forEach((portforward: any) => {
        const isStoragePortForwardAvailableInServer = portForwards.find(
          (pf: any) => pf.id === portforward.id
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

      localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(serverAndStoragePortForwards));
    });
  }, []);

  if (!isElectron()) {
    return null;
  }

  if (!isPod && podsFetchError) {
    return null;
  }

  if (!isPod && (!pods || pods.length === 0)) {
    return null;
  }

  function handlePortForward() {
    if (!namespace || !cluster || !pods) {
      return;
    }

    setError(null);

    const resourceName = name || '';
    const podNamespace = isPod ? namespace : pods[0].metadata.namespace!;
    const serviceNamespace = namespace;
    const serviceName = !isPod ? resourceName : '';
    const podName = isPod ? resourceName : pods![0].metadata.name;
    var port = portForward?.port;

    let address = 'localhost';
    // In case of docker desktop only a range of ports are open
    // so we need to generate a random port from that range
    // while making sure that it is not already in use
    if (isDockerDesktop()) {
      const validMinPort = 30000;
      const validMaxPort = 32000;

      // create a list of active ports
      const activePorts: string[] = [];
      const portForwardsInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
      const parsedPortForwards = JSON.parse(portForwardsInStorage || '[]');
      parsedPortForwards.forEach((pf: any) => {
        if (pf.status === PORT_FORWARD_RUNNING_STATUS) {
          activePorts.push(pf.port);
        }
      });

      // generate random port till it is not in use
      while (true) {
        const randomPort = (
          Math.floor(Math.random() * (validMaxPort - validMinPort + 1)) + validMinPort
        ).toString();
        if (!activePorts.includes(randomPort)) {
          port = randomPort;
          break;
        }
      }
      address = '0.0.0.0';
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
      .then((data: any) => {
        setLoading(false);
        setPortForward(data);

        // append this new started portforward to storage
        const portForwardsInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
        const parsedPortForwards = JSON.parse(portForwardsInStorage || '[]');
        parsedPortForwards.push(data);
        localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));
      })
      .catch(() => {
        setPortForward(null);
      });
  }

  function portForwardStopHandler() {
    if (!portForward || !cluster) {
      return;
    }
    setLoading(true);
    stopOrDeletePortForward(cluster, portForward.id, true)
      .then(() => {
        portForward.status = PORT_FORWARD_STOP_STATUS;
        setPortForward(portForward);
      })
      .catch(() => {
        setPortForward(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function deletePortForwardHandler() {
    const id = portForward?.id;
    const cluster = getCluster();
    setLoading(true);
    if (!cluster || !id) {
      return;
    }
    stopOrDeletePortForward(cluster, id, false).finally(() => {
      setLoading(false);
      // remove portforward from storage too
      const portforwardInStorage = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
      const parsedPortForwards = JSON.parse(portforwardInStorage || '[]');
      const index = parsedPortForwards.findIndex((pf: any) => pf.id === id);
      if (index !== -1) {
        parsedPortForwards.splice(index, 1);
      }
      localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify(parsedPortForwards));
      setPortForward(null);
    });
  }

  if (isPod && (!resource || (resource as Pod).status.phase === 'Failed')) {
    return null;
  }

  const forwardBaseURL = 'http://127.0.0.1';

  return !portForward ? (
    <Box display="flex">
      {loading ? (
        <CircularProgress size={18} />
      ) : (
        <Button
          onClick={handlePortForward}
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
      {error && (
        <Box>
          {
            <Alert
              severity="error"
              onClose={() => {
                setError(null);
              }}
            >
              <Tooltip title="error">
                <Box style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{error}</Box>
              </Tooltip>
            </Alert>
          }
        </Box>
      )}
    </Box>
  ) : (
    <Box>
      {portForward.status === PORT_FORWARD_STOP_STATUS ? (
        <Box display={'flex'} alignItems="center">
          <Typography
            style={{
              color: grey[500],
            }}
          >{`${forwardBaseURL}:${portForward.port}`}</Typography>
          <ActionButton
            onClick={handlePortForward}
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
          <MuiLink href={`${forwardBaseURL}:${portForward.port}`} target="_blank" color="primary">
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
    </Box>
  );
}

export default function PortForward(props: PortForwardProps) {
  if (!isElectron()) return null;

  return <PortForwardContent {...props} />;
}
