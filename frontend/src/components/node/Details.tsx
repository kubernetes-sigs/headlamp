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
import { Paper } from '@mui/material';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import _ from 'lodash';
import { useSnackbar } from 'notistack';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import { apply, drainNode, drainNodeStatus } from '../../lib/k8s/apiProxy';
import { KubeMetrics } from '../../lib/k8s/cluster';
import Node from '../../lib/k8s/node';
import { getCluster, timeAgo } from '../../lib/util';
import { DefaultHeaderAction } from '../../redux/actionButtonsSlice';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import { CpuCircularChart, MemoryCircularChart } from '../cluster/Charts';
import { ActionButton, ConfirmDialog, StatusLabelProps } from '../common';
import { HeaderLabel, StatusLabel, ValueLabel } from '../common/Label';
import { ConditionsSection, DetailsGrid, OwnedPodsSection } from '../common/Resource';
import AuthVisible from '../common/Resource/AuthVisible';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable } from '../common/SimpleTable';
import { NodeShellAction } from './NodeShellAction';
import { NodeTaintsLabel } from './utils';

function NodeConditionsLabel(props: { node: Node }) {
  const { node } = props;
  const unschedulable = node?.jsonData?.spec?.unschedulable;
  const { t } = useTranslation();
  return unschedulable ? (
    <StatusLabel status="warning">{t('translation|Scheduling Disabled')}</StatusLabel>
  ) : (
    <StatusLabel status="success">{t('translation|Scheduling Enabled')}</StatusLabel>
  );
}

export default function NodeDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary']);
  const dispatch: AppDispatch = useDispatch();

  const { enqueueSnackbar } = useSnackbar();
  const [nodeMetrics, metricsError] = Node.useMetrics();
  const [isupdatingNodeScheduleProperty, setisUpdatingNodeScheduleProperty] = React.useState(false);
  const [isNodeDrainInProgress, setisNodeDrainInProgress] = React.useState(false);
  const [nodeFromAPI, nodeError] = Node.useGet(name);
  const [node, setNode] = useState(nodeFromAPI);
  const noMetrics = metricsError?.status === 404;
  const [drainDialogOpen, setDrainDialogOpen] = useState(false);

  useEffect(() => {
    setNode(nodeFromAPI);
  }, [nodeFromAPI]);

  function getAddresses(item: Node) {
    return (
      item.status.addresses?.map(({ type, address }) => {
        return {
          name: type,
          value: address,
        };
      }) || []
    );
  }

  function handleNodeScheduleState(node: Node, cordon: boolean) {
    setisUpdatingNodeScheduleProperty(true);
    const cloneNode = _.cloneDeep(node);

    cloneNode.spec.unschedulable = !cordon;
    dispatch(
      clusterAction(
        () =>
          apply(cloneNode.jsonData)
            .then(() => {
              setNode(cloneNode);
            })
            .finally(() => {
              setisUpdatingNodeScheduleProperty(false);
            }),
        {
          startMessage: cordon
            ? t('Uncordoning node {{name}}…', {
                name: node.metadata.name,
              })
            : t('Cordoning node {{name}}…', { name: node.metadata.name }),
          successMessage: cordon
            ? t('Uncordoned node {{name}}.', { name: node.metadata.name })
            : t('Cordoned node {{name}}.', { name: node.metadata.name }),
          errorMessage: cordon
            ? t('Failed to uncordon node {{name}}.', { name: node.metadata.name })
            : t('Failed to cordon node {{name}}.', { name: node.metadata.name }),
          cancelledMessage: cordon
            ? t('Uncordon node {{name}} cancelled.', { name: node.metadata.name })
            : t('Cordon node {{name}} cancelled.', { name: node.metadata.name }),
          cancelCallback: () => {
            setisUpdatingNodeScheduleProperty(false);
          },
        }
      )
    );
  }

  function getDrainNodeStatus(cluster: string, nodeName: string) {
    setTimeout(() => {
      drainNodeStatus(cluster, nodeName)
        .then(data => {
          if (data && data.id.startsWith('error')) {
            enqueueSnackbar(data.id, { variant: 'error' });
            return;
          }
          if (data && data.id !== 'success') {
            getDrainNodeStatus(cluster, nodeName);
            return;
          }
          const cloneNode = _.cloneDeep(node);

          cloneNode!.spec.unschedulable = !node!.spec.unschedulable;
          setNode(cloneNode);
        })
        .catch(error => {
          enqueueSnackbar(error.message, { variant: 'error' });
        });
    }, 1000);
  }

  function toggleDrainDialogVisibility() {
    setDrainDialogOpen(drainDialogOpen => !drainDialogOpen);
  }

  function handleNodeDrain(node: Node) {
    const cluster = getCluster();
    if (!cluster) return;

    setisNodeDrainInProgress(true);
    dispatch(
      clusterAction(
        () =>
          drainNode(cluster, node.metadata.name)
            .then(() => {
              getDrainNodeStatus(cluster, node.metadata.name);
            })
            .catch(error => {
              enqueueSnackbar(error.message, { variant: 'error' });
            })
            .finally(() => {
              setisNodeDrainInProgress(false);
            }),
        {
          startMessage: t('Draining node {{name}}…', { name: node.metadata.name }),
          successMessage: t('Drained node {{name}}.', { name: node.metadata.name }),
          errorMessage: t('Failed to drain node {{name}}.', { name: node.metadata.name }),
          cancelledMessage: t('Draining node {{name}} cancelled.', { name: node.metadata.name }),
          cancelCallback: () => {
            setisNodeDrainInProgress(false);
          },
        }
      )
    );
  }

  function DrainDialog() {
    return (
      <>
        <ConfirmDialog
          title={t('Drain Node')}
          description={t('Are you sure you want to drain the node {{name}}?', {
            name: node?.metadata.name,
          })}
          onConfirm={() => {
            setDrainDialogOpen(false);
            handleNodeDrain(node!);
          }}
          handleClose={() => setDrainDialogOpen(false)}
          open={drainDialogOpen}
        />
      </>
    );
  }

  return (
    <>
      <DrainDialog />
      <DetailsGrid
        resourceType={Node}
        name={name}
        cluster={cluster}
        error={nodeError}
        headerSection={item => (
          <ChartsSection node={item} metrics={nodeMetrics} noMetrics={noMetrics} />
        )}
        withEvents
        actions={item => {
          const cordon = item?.jsonData?.spec?.unschedulable;
          const cordonOrUncordon = cordon ? t('Uncordon') : t('Cordon');

          return [
            {
              id: DefaultHeaderAction.NODE_TOGGLE_CORDON,
              action: (
                <AuthVisible item={item} authVerb="update">
                  <ActionButton
                    description={cordonOrUncordon}
                    icon={cordon ? 'mdi:check-circle-outline' : 'mdi:cancel'}
                    onClick={() => handleNodeScheduleState(item!, cordon)}
                    iconButtonProps={{
                      disabled: isupdatingNodeScheduleProperty,
                    }}
                  />
                </AuthVisible>
              ),
            },
            {
              id: DefaultHeaderAction.NODE_DRAIN,
              action: (
                <AuthVisible item={item} authVerb="delete">
                  <ActionButton
                    description={t('Drain')}
                    icon="mdi:delete-variant"
                    onClick={() => toggleDrainDialogVisibility()}
                    iconButtonProps={{
                      disabled: isNodeDrainInProgress,
                    }}
                  />
                </AuthVisible>
              ),
            },
            {
              id: DefaultHeaderAction.NODE_SHELL,
              action: <NodeShellAction item={item} />,
            },
          ];
        }}
        extraInfo={item =>
          item && [
            {
              name: t('translation|Taints'),
              value: <NodeTaintsLabel node={item} />,
            },
            {
              name: t('translation|Ready'),
              value: <NodeReadyLabel node={item} />,
            },
            {
              name: t('translation|Conditions'),
              value: <NodeConditionsLabel node={item} />,
            },
            {
              name: t('Pod CIDR'),
              value: item.spec.podCIDR,
            },
            ...getAddresses(item),
          ]
        }
        extraSections={item =>
          item && [
            {
              id: 'headlamp.node-system-info',
              section: <SystemInfoSection node={item} />,
            },
            {
              id: 'headlamp.node-conditions',
              section: <ConditionsSection resource={item} />,
            },
            {
              id: 'headlamp.node-owned-pods',
              section: <OwnedPodsSection resource={item} />,
            },
          ]
        }
      />
    </>
  );
}

interface ChartsSectionProps {
  node: Node | null;
  metrics: KubeMetrics[] | null;
  noMetrics?: boolean;
}

function ChartsSection(props: ChartsSectionProps) {
  const { node, metrics, noMetrics } = props;
  const { t } = useTranslation('glossary');

  function getUptime() {
    if (!node) {
      return '…';
    }

    const readyInfo = node.status.conditions?.find(({ type }) => type === 'Ready');
    if (readyInfo) {
      return timeAgo(readyInfo.lastTransitionTime as string);
    }

    return t('translation|Not ready yet!');
  }

  return (
    <Box py={2}>
      <Grid
        container
        style={{
          marginBottom: '2rem',
        }}
        alignItems="stretch"
        spacing={2}
      >
        <Grid item xs={4}>
          <Paper
            variant="outlined"
            sx={theme => ({
              background: theme.palette.background.muted,
              padding: theme.spacing(2),
              height: '100%',
              maxWidth: '300px',
              margin: '0 auto',
            })}
          >
            <HeaderLabel value={getUptime()} label={t('Uptime')} />
          </Paper>
        </Grid>
        <Grid item xs={4}>
          <CpuCircularChart items={node && [node]} itemsMetrics={metrics} noMetrics={noMetrics} />
        </Grid>
        <Grid item xs={4}>
          <MemoryCircularChart
            items={node && [node]}
            itemsMetrics={metrics}
            noMetrics={noMetrics}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

interface SystemInfoSectionProps {
  node: Node;
}

function SystemInfoSection(props: SystemInfoSectionProps) {
  const { node } = props;
  const { t } = useTranslation('glossary');

  function getOSComponent(osName: string) {
    let icon = null;

    if (osName.toLowerCase() === 'linux') {
      icon = <InlineIcon icon="mdi:penguin" />;
    }

    return (
      <React.Fragment>
        {icon}
        <ValueLabel>{osName}</ValueLabel>
      </React.Fragment>
    );
  }

  if (!node || !node.status.nodeInfo) {
    return null;
  }

  return (
    <SectionBox title={t('System Info')}>
      <NameValueTable
        rows={[
          {
            name: t('Architecture'),
            value: node.status.nodeInfo.architecture,
          },
          {
            name: t('Boot ID'),
            value: node.status.nodeInfo.bootID,
          },
          {
            name: t('System UUID'),
            value: node.status.nodeInfo.systemUUID,
          },
          {
            name: t('OS'),
            value: getOSComponent(node.status.nodeInfo.operatingSystem),
          },
          {
            name: t('Image'),
            value: node.status.nodeInfo.osImage,
          },
          {
            name: t('Kernel Version'),
            value: node.status.nodeInfo.kernelVersion,
          },
          {
            name: t('Machine ID'),
            value: node.status.nodeInfo.machineID,
          },
          {
            name: t('Kube Proxy Version'),
            value: node.status.nodeInfo.kubeProxyVersion,
          },
          {
            name: t('Kubelet Version'),
            value: node.status.nodeInfo.kubeletVersion,
          },
          {
            name: t('Container Runtime Version'),
            value: node.status.nodeInfo.containerRuntimeVersion,
          },
        ]}
      />
    </SectionBox>
  );
}

interface NodeReadyLabelProps {
  node: Node;
}

export function NodeReadyLabel(props: NodeReadyLabelProps) {
  const { node } = props;
  const isReady = !!node.status.conditions?.find(
    condition => condition.type === 'Ready' && condition.status === 'True'
  );
  const { t } = useTranslation();

  let status: StatusLabelProps['status'] = '';
  let label = null;
  if (isReady) {
    status = 'success';
    label = t('translation|Yes');
  } else {
    status = 'error';
    label = t('translation|No');
  }

  return <StatusLabel status={status}>{label}</StatusLabel>;
}
