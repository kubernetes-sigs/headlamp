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

import { Icon } from '@iconify/react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import { getKubeObjectCategory, ResourceCategory } from '../../lib/k8s/ResourceCategory';
import StatefulSet from '../../lib/k8s/statefulSet';
import { Activity } from '../activity/Activity';
import { StatusLabel } from '../common';
import ActionButton from '../common/ActionButton/ActionButton';
import Link from '../common/Link';
import AuthVisible from '../common/Resource/AuthVisible';
import DeleteButton from '../common/Resource/DeleteButton';
import ScaleButton from '../common/Resource/ScaleButton';
import { TableColumn } from '../common/Table';
import Table from '../common/Table';
import Terminal from '../common/Terminal';
import { PodLogViewer } from '../pod/Details';
import { getStatus, KubeObjectStatus } from '../resourceMap/nodes/KubeObjectStatus';
import { getHealthIcon, getResourcesHealth } from './projectUtils';

interface ProjectResourcesTabProps {
  projectResources: KubeObject[];
  showClusterColumn?: boolean;
}

export function ProjectResourcesTab({
  projectResources,
  showClusterColumn,
}: ProjectResourcesTabProps) {
  const { t } = useTranslation();
  const [selectedCategoryName, setSelectedCategoryName] = React.useState<string>();

  const resourceCategories = React.useMemo(() => {
    const groups = new Map<
      ResourceCategory,
      {
        items: KubeObject[];
        health: Record<KubeObjectStatus, number>;
      }
    >();

    // Place items per group
    projectResources.forEach(r => {
      const category = getKubeObjectCategory(r);
      if (!groups.has(category)) {
        groups.set(category, { items: [], health: {} as any });
      }
      const group = groups.get(category)!;
      group.items.push(r);
    });

    // Calculate health per group
    groups.forEach(value => {
      value.health = getResourcesHealth(value.items);
    });

    return [...groups.entries()];
  }, [projectResources]);

  const { selectedCategory, selectedResources } = useMemo(() => {
    const group =
      selectedCategoryName &&
      resourceCategories.find(([category]) => category.label === selectedCategoryName);
    if (group) {
      return { selectedCategory: group[0], selectedResources: group[1].items };
    }

    return { selectedCategory: undefined, selectedResources: undefined };
  }, [resourceCategories, selectedCategoryName]);

  const columns = React.useMemo<TableColumn<KubeObject>[]>(
    () => [
      {
        id: 'kind',
        accessorFn: item => item.kind,
        header: t('Kind'),
        gridTemplate: 'min-content',
      },
      {
        id: 'name',
        accessorFn: item => item.metadata.uid + item.metadata.name,
        header: t('Name'),
        Cell: ({ row }) => {
          const resource = row.original;
          return <Link kubeObject={resource}>{resource.metadata?.name}</Link>;
        },
      },
      {
        id: 'health',
        gridTemplate: 'min-content',
        accessorFn: resource => {
          const kind = resource.kind;
          if (kind === 'Deployment') {
            const deployment = resource as Deployment;
            const spec = deployment.spec;
            const status = deployment.status;
            if (status?.readyReplicas === 0) return 'Unhealthy';
            if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) return 'Degraded';
          } else if (kind === 'StatefulSet') {
            const statefulSet = resource as StatefulSet;
            const spec = statefulSet.spec;
            const status = statefulSet.status;
            if (status?.readyReplicas === 0) return 'Unhealthy';
            if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) return 'Degraded';
          } else if (kind === 'DaemonSet') {
            const daemonSet = resource as DaemonSet;
            const status = daemonSet.status;
            if (status?.numberReady === 0) return 'Unhealthy';
            if ((status?.numberReady || 0) < (status?.desiredNumberScheduled || 0))
              return 'Degraded';
          } else if (kind === 'Pod') {
            const pod = resource as Pod;
            const phase = pod.status?.phase;
            const conditions = pod.status?.conditions || [];
            const ready = conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

            if (phase === 'Failed' || phase === 'CrashLoopBackOff') return 'Failed';
            if (phase === 'Pending' || !ready) return 'Pending';
          }
          return 'Healthy';
        },
        header: t('Health'),
        Cell: ({ row }) => {
          const resource = row.original;
          const kind = resource.kind;
          let healthText = 'Healthy';
          const status = getStatus(resource);

          if (kind === 'Deployment') {
            const deployment = resource as Deployment;
            const spec = deployment.spec;
            const status = deployment.status;
            if (status?.readyReplicas === 0) {
              healthText = 'Unhealthy';
            } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
              healthText = 'Degraded';
            }
          } else if (kind === 'StatefulSet') {
            const statefulSet = resource as StatefulSet;
            const spec = statefulSet.spec;
            const status = statefulSet.status;
            if (status?.readyReplicas === 0) {
              healthText = 'Unhealthy';
            } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
              healthText = 'Degraded';
            }
          } else if (kind === 'DaemonSet') {
            const daemonSet = resource as DaemonSet;
            const status = daemonSet.status;
            if (status?.numberReady === 0) {
              healthText = 'Unhealthy';
            } else if ((status?.numberReady || 0) < (status?.desiredNumberScheduled || 0)) {
              healthText = 'Degraded';
            }
          } else if (kind === 'Pod') {
            const pod = resource as Pod;
            const phase = pod.status?.phase;
            const conditions = pod.status?.conditions || [];
            const ready = conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

            if (phase === 'Failed' || phase === 'CrashLoopBackOff') {
              healthText = 'Failed';
            } else if (phase === 'Pending' || !ready) {
              healthText = 'Pending';
            }
          }

          return (
            <StatusLabel status={status} sx={{ alignItems: 'center' }}>
              <Icon
                icon={
                  status === 'error'
                    ? 'mdi:alert'
                    : status === 'warning'
                    ? 'mdi:alert-circle'
                    : 'mdi:check-circle'
                }
                style={{
                  fontSize: 16,
                }}
              />
              {healthText}
            </StatusLabel>
          );
        },
      },
      {
        id: 'namespace',
        accessorFn: item => item.metadata.namespace || 'default',
        header: t('Namespace'),
        gridTemplate: 'min-content',
      },
      {
        id: 'cluster',
        accessorFn: item => item.cluster,
        header: t('Cluster'),
        gridTemplate: 'min-content',
      },
      {
        id: 'details',
        gridTemplate: 'min-content',
        accessorFn: resource => {
          const kind = resource.kind;
          if (['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind)) {
            const res = resource as Deployment | StatefulSet | ReplicaSet;
            return `Replicas: ${res.status?.readyReplicas || res.status?.availableReplicas || 0}/${
              res.spec?.replicas || 0
            }`;
          }
          if (kind === 'DaemonSet') {
            const res = resource as DaemonSet;
            return `Ready: ${res.status?.numberReady || 0}/${
              res.status?.desiredNumberScheduled || 0
            }`;
          }
          if (kind === 'Pod') {
            const res = resource as Pod;
            return `Phase: ${res.status?.phase}`;
          }
          return '';
        },
        header: t('Details'),
        Cell: ({ row }) => {
          const resource = row.original;
          const kind = resource.kind;
          if (['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind)) {
            const res = resource as Deployment | StatefulSet | ReplicaSet;
            return (
              <Typography variant="body2" color="text.secondary" whiteSpace="nowrap">
                {`Replicas: ${res.status?.readyReplicas || res.status?.availableReplicas || 0}/${
                  res.spec?.replicas || 0
                }`}
              </Typography>
            );
          }
          if (kind === 'DaemonSet') {
            const res = resource as DaemonSet;
            return (
              <Typography variant="body2" color="text.secondary" whiteSpace="nowrap">
                {`Ready: ${res.status?.numberReady || 0}/${
                  res.status?.desiredNumberScheduled || 0
                }`}
              </Typography>
            );
          }
          if (kind === 'Pod') {
            const res = resource as Pod;
            return (
              <Typography variant="body2" color="text.secondary" whiteSpace="nowrap">
                {`Phase: ${res.status?.phase}`}
              </Typography>
            );
          }
          return null;
        },
      },
      {
        id: 'age',
        accessorFn: item => item.metadata.creationTimestamp,
        header: t('Age'),
        gridTemplate: 'min-content',
        Cell: ({ row }) => {
          const resource = row.original;
          const createdDate = resource.metadata?.creationTimestamp
            ? new Date(resource.metadata.creationTimestamp)
            : null;
          const ageText = createdDate
            ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 'd'
            : 'Unknown';
          return (
            <Typography variant="caption" color="text.secondary">
              {ageText}
            </Typography>
          );
        },
      },
      {
        id: 'actions',
        header: t('Actions'),
        gridTemplate: 'min-content',
        accessorFn: item => item.metadata.uid,
        Cell: ({ row }) => {
          const resource = row.original;
          const kind = resource.kind;
          const isScalable = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind);
          const isPod = kind === 'Pod';

          return (
            <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
              {isScalable && (
                <ScaleButton item={resource as Deployment | StatefulSet | ReplicaSet} />
              )}
              {isPod && (
                <>
                  <AuthVisible item={resource} authVerb="get" subresource="log">
                    <ActionButton
                      description={t('Show Logs')}
                      icon="mdi:file-document-box-outline"
                      onClick={() => {
                        const id = 'logs-' + resource.metadata.uid;
                        Activity.launch({
                          id,
                          title: t('Logs') + ': ' + resource.metadata.name,
                          cluster: resource.cluster,
                          icon: (
                            <Icon icon="mdi:file-document-box-outline" width="100%" height="100%" />
                          ),
                          location: 'full',
                          content: (
                            <PodLogViewer
                              noDialog
                              open
                              item={resource as Pod}
                              onClose={() => Activity.close(id)}
                            />
                          ),
                        });
                      }}
                    />
                  </AuthVisible>
                  <AuthVisible item={resource} authVerb="create" subresource="exec">
                    <ActionButton
                      description={t('Terminal / Exec')}
                      icon="mdi:console"
                      onClick={() => {
                        const id = 'terminal-' + resource.metadata.uid;
                        Activity.launch({
                          id,
                          title: resource.metadata.name,
                          cluster: resource.cluster,
                          icon: <Icon icon="mdi:console" width="100%" height="100%" />,
                          location: 'full',
                          content: (
                            <Terminal
                              open
                              item={resource as Pod}
                              onClose={() => Activity.close(id)}
                            />
                          ),
                        });
                      }}
                    />
                  </AuthVisible>
                  <DeleteButton item={resource as Pod} />
                </>
              )}
            </Box>
          );
        },
      },
    ],
    [t, showClusterColumn]
  );

  return (
    <>
      <Box
        sx={theme => ({
          display: 'flex',
          border: '1px solid',
          borderColor: theme.palette.divider,
          borderTop: 0,
          flexGrow: 1,
          minHeight: 0,
          flexBasis: 0,
        })}
      >
        <Box
          sx={theme => ({
            borderRight: '1px solid',
            borderColor: theme.palette.divider,
            flexShrink: 0,
          })}
        >
          <List dense>
            {resourceCategories.map(([category, { items, health }]) => {
              const healthColor =
                health.error > 0
                  ? 'error.main'
                  : health.warning > 0
                  ? 'warning.main'
                  : items.length > 0
                  ? 'success.main'
                  : 'grey.500';

              const healthIcon = getHealthIcon(health.success, health.error, health.warning);

              return (
                <ListItem key={category.label} disablePadding>
                  <ListItemButton
                    onClick={() => setSelectedCategoryName(category.label)}
                    selected={selectedCategoryName === category.label}
                  >
                    <ListItemIcon>
                      <Icon icon={category.icon} style={{ fontSize: 32 }} />
                    </ListItemIcon>
                    <ListItemText primary={category.label} secondary={category.description} />
                    <ListItemIcon sx={{ justifyContent: 'flex-end' }}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography
                          variant="h6"
                          sx={{
                            color: items.length > 0 ? healthColor : 'text.primary',
                            lineHeight: 1,
                          }}
                        >
                          {items.length}
                        </Typography>
                        {items.length > 0 && (
                          <Icon
                            icon={healthIcon}
                            style={{
                              fontSize: 20,
                              color: healthColor,
                            }}
                          />
                        )}
                      </Box>
                    </ListItemIcon>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>

        <Box sx={{ flexGrow: 1, p: 1, overflowY: 'auto' }}>
          {selectedCategory && (
            <Box>
              {selectedResources.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('No {{category}} resources found for this project.', {
                    category: selectedCategory.label.toLowerCase(),
                  })}
                </Typography>
              ) : (
                <Table
                  columns={columns}
                  data={selectedResources}
                  state={{
                    columnVisibility: {
                      cluster: !!showClusterColumn,
                    },
                  }}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
