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

import React from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Chip, Divider } from '@mui/material';
import { Icon } from '@iconify/react';
import { useTypedSelector } from '../../redux/hooks';
import { createRouteURL } from '../../lib/router';
import { matchesProject } from './projectUtils';
import { getCluster } from '../../lib/cluster';
import SectionBox from '../common/SectionBox';
import Link from '../common/Link';
import Service from '../../lib/k8s/service';
import Deployment from '../../lib/k8s/deployment';
import StatefulSet from '../../lib/k8s/statefulSet';
import DaemonSet from '../../lib/k8s/daemonSet';
import Job from '../../lib/k8s/job';
import CronJob from '../../lib/k8s/cronJob';
import ConfigMap from '../../lib/k8s/configMap';
import Secret from '../../lib/k8s/secret';
import Ingress from '../../lib/k8s/ingress';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import Pod from '../../lib/k8s/pod';
import ScaleButton from '../common/Resource/ScaleButton';
import ReplicaSet from '../../lib/k8s/replicaSet';
import { DeleteButton } from '../common/Resource';
import ActionButton from '../common/ActionButton';
import AuthVisible from '../common/Resource/AuthVisible';
import { Activity } from '../activity/Activity';
import Terminal from '../common/Terminal';
import { PodLogViewer } from '../pod/Details';

interface ProjectResourceListParams {
  projectId: string;
  category: string;
}

const resourceCategories = [
  {
    category: 'workloads',
    displayName: 'Workloads',
    icon: 'mdi:apps',
    kinds: ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Pod'],
    description: 'Applications and compute resources',
    scalingNotice: 'Workloads can be scaled up or down based on demand'
  },
  {
    category: 'networking',
    displayName: 'Networking',
    icon: 'mdi:network',
    kinds: ['Service', 'Ingress'],
    description: 'Network connectivity and exposure',
    scalingNotice: 'Network resources typically scale with workloads'
  },
  {
    category: 'configuration',
    displayName: 'Configuration',
    icon: 'mdi:cog',
    kinds: ['ConfigMap', 'Secret'],
    description: 'Configuration data and secrets',
    scalingNotice: 'Configuration resources are usually static'
  },
  {
    category: 'storage',
    displayName: 'Storage',
    icon: 'mdi:database',
    kinds: ['PersistentVolumeClaim'],
    description: 'Persistent data storage',
    scalingNotice: 'Storage can be expanded but rarely shrunk'
  }
];

export default function ProjectResourceList() {
  const { t } = useTranslation();
  const history = useHistory();
  const { projectId, category } = useParams<ProjectResourceListParams>();

  const projectsState = useTypedSelector(state => state.projects.projects);
  const projects = Object.values(projectsState);
  const project = projects.find(p => p.id === projectId);
  const currentCluster = getCluster();
  const projectClusters = React.useMemo(() => {
    return project?.clusterSelectors?.map(selector => selector.name) || [];
  }, [project]);

  // Watch all resource types
  const { items: deployments } = Deployment.useList({clusters: projectClusters});
  const { items: services } = Service.useList({clusters: projectClusters});
  const { items: statefulSets } = StatefulSet.useList({clusters: projectClusters});
  const { items: daemonSets } = DaemonSet.useList({clusters: projectClusters});
  const { items: jobs } = Job.useList({clusters: projectClusters});
  const { items: cronJobs } = CronJob.useList({clusters: projectClusters});
  const { items: configMaps } = ConfigMap.useList({clusters: projectClusters});
  const { items: secrets } = Secret.useList({clusters: projectClusters});
  const { items: ingresses } = Ingress.useList({clusters: projectClusters});
  const { items: pvcs } = PersistentVolumeClaim.useList({clusters: projectClusters});
  const { items: pods } = Pod.useList({clusters: projectClusters});

  const categoryInfo = resourceCategories.find(cat => cat.category === category);

  if (!project) {
    return (
      <SectionBox title={t('Project Not Found')}>
        <Typography>{t('The requested project could not be found.')}</Typography>
      </SectionBox>
    );
  }

  if (!categoryInfo) {
    return (
      <SectionBox title={t('Category Not Found')}>
        <Typography>{t('The requested category could not be found.')}</Typography>
      </SectionBox>
    );
  }

  const allResources = [
    ...(deployments || []),
    ...(services || []),
    ...(statefulSets || []),
    ...(daemonSets || []),
    ...(jobs || []),
    ...(cronJobs || []),
    ...(configMaps || []),
    ...(secrets || []),
    ...(ingresses || []),
    ...(pvcs || []),
    ...(pods || []),
  ];  // Filter resources that match the project and belong to this category
  const categoryResources = allResources.filter(resource => {
    return categoryInfo.kinds.includes(resource.kind) &&
           matchesProject(resource, project, currentCluster || undefined);
  });

  return (
    <SectionBox
      title={
        <Box display="flex" alignItems="center" gap={2}>
          <Icon icon={project.icon || 'mdi:application'} width={32} height={32} style={{ color: project.color || '#1976d2' }} />
          <Box>
            <Typography variant="h4" component="span">
              {project.name}
            </Typography>
            <Typography variant="h6" color="text.secondary" component="div">
              <Icon icon={categoryInfo.icon} style={{ fontSize: 20, marginRight: 8, verticalAlign: 'middle' }} />
              {categoryInfo.displayName}
            </Typography>
          </Box>
        </Box>
      }
      backLink={createRouteURL('projectDetails', { projectId })}
    >
      {/* Category Info */}
      <Box mb={3}>
        <Typography variant="body2" color="text.secondary" paragraph>
          {categoryInfo.description}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{
          fontStyle: 'italic',
          display: 'block',
          fontSize: '0.75rem'
        }}>
          💡 {categoryInfo.scalingNotice}
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* Project Selection Criteria */}
        <Box display="flex" flexWrap="wrap" gap={2} alignItems="center">
          <Typography variant="subtitle2" color="text.secondary">
            {t('Project Criteria:')}
          </Typography>

          {project.clusterSelectors && project.clusterSelectors.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={1}>
              <Typography variant="caption" color="text.secondary">
                {t('Clusters:')}
              </Typography>
              {project.clusterSelectors.map((selector, index) => (
                <Chip
                  key={index}
                  label={selector.name || t('All Clusters')}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          )}

          {project.namespaceSelectors.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={1}>
              <Typography variant="caption" color="text.secondary">
                {t('Namespaces:')}
              </Typography>
              {project.namespaceSelectors.map((selector, index) => (
                <Chip
                  key={index}
                  label={selector.name}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          )}

          <Box display="flex" flexWrap="wrap" gap={1}>
            <Typography variant="caption" color="text.secondary">
              {t('Labels:')}
            </Typography>
            {project.labelSelectors.map((selector, index) => (
              <Chip
                key={index}
                label={`${selector.key} ${selector.operator} ${selector.value || ''}`}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* Resource Table */}
      <Box>
        <Typography variant="h6" gutterBottom>
          {t('{{category}} Resources ({{count}})', {
            category: categoryInfo.displayName,
            count: categoryResources.length
          })}
        </Typography>

        {categoryResources.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('No {{category}} resources found for this project.', { category: categoryInfo.displayName.toLowerCase() })}
          </Typography>
        ) : (
          <Box>
            {categoryInfo.kinds.map(kind => {
              const kindResources = categoryResources.filter(r => r.kind === kind);
              if (kindResources.length === 0) return null;

              return (
                <Box key={kind} mb={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    {kind} ({kindResources.length})
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    {kindResources.map((resource, index) => {
                      // Calculate health for this specific resource
                      let healthColor = 'success.main';
                      let healthIcon = 'mdi:check-circle';
                      let healthText = 'Healthy';

                      if (kind === 'Deployment') {
                        const deployment = resource as Deployment;
                        const spec = deployment.spec;
                        const status = deployment.status;
                        if (status?.readyReplicas === 0) {
                          healthColor = 'error.main';
                          healthIcon = 'mdi:alert-circle';
                          healthText = 'Unhealthy';
                        } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
                          healthColor = 'warning.main';
                          healthIcon = 'mdi:alert';
                          healthText = 'Degraded';
                        }
                      } else if (kind === 'StatefulSet') {
                        const statefulSet = resource as StatefulSet;
                        const spec = statefulSet.spec;
                        const status = statefulSet.status;
                        if (status?.readyReplicas === 0) {
                          healthColor = 'error.main';
                          healthIcon = 'mdi:alert-circle';
                          healthText = 'Unhealthy';
                        } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
                          healthColor = 'warning.main';
                          healthIcon = 'mdi:alert';
                          healthText = 'Degraded';
                        }
                      } else if (kind === 'DaemonSet') {
                        const daemonSet = resource as DaemonSet;
                        const status = daemonSet.status;
                        if (status?.numberReady === 0) {
                          healthColor = 'error.main';
                          healthIcon = 'mdi:alert-circle';
                          healthText = 'Unhealthy';
                        } else if ((status?.numberReady || 0) < (status?.desiredNumberScheduled || 0)) {
                          healthColor = 'warning.main';
                          healthIcon = 'mdi:alert';
                          healthText = 'Degraded';
                        }
                      } else if (kind === 'Pod') {
                        const pod = resource as Pod;
                        const phase = pod.status?.phase;
                        const conditions = pod.status?.conditions || [];
                        const ready = conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

                        if (phase === 'Failed' || phase === 'CrashLoopBackOff') {
                          healthColor = 'error.main';
                          healthIcon = 'mdi:alert-circle';
                          healthText = 'Failed';
                        } else if (phase === 'Pending' || !ready) {
                          healthColor = 'warning.main';
                          healthIcon = 'mdi:alert';
                          healthText = 'Pending';
                        }
                      }

                      const createdDate = resource.metadata?.creationTimestamp ?
                        new Date(resource.metadata.creationTimestamp) : null;
                      const ageText = createdDate ?
                        Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 'd' :
                        'Unknown';
                      const isScalable = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind);
                      const isPod = kind === 'Pod';

                      return (
                        <Box
                          key={`${resource.metadata?.namespace || 'default'}-${resource.metadata?.name}-${index}`}
                          p={2}
                          border={1}
                          borderColor="divider"
                          borderRadius={1}
                          sx={{
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                        >
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Box flex={1}>
                              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                <Link kubeObject={resource}>
                                  <Typography variant="body1" fontWeight="medium" component="span">
                                    {resource.metadata?.name}
                                  </Typography>
                                </Link>
                                <Icon
                                  icon={healthIcon}
                                  style={{
                                    fontSize: 16,
                                    color: healthColor
                                  }}
                                />
                                <Typography variant="caption" sx={{ color: healthColor }}>
                                  {healthText}
                                </Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary">
                                {resource.metadata?.namespace && `Namespace: ${resource.metadata.namespace}`}
                                {resource.metadata?.namespace && ' • '}
                                Cluster: {resource.cluster || 'default'}
                                {['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind) && resource.status &&
                                  ` • Replicas: ${resource.status.readyReplicas || resource.status.availableReplicas || 0}/${resource.spec?.replicas || 0}`
                                }
                                {kind === 'DaemonSet' && resource.status &&
                                  ` • Ready: ${resource.status.numberReady || 0}/${resource.status.desiredNumberScheduled || 0}`
                                }
                                {kind === 'Pod' && resource.status?.phase &&
                                  ` • Phase: ${resource.status.phase}`
                                }
                              </Typography>
                            </Box>
                            <Box textAlign="right" display="flex" alignItems="center" gap={1}>
                              {isScalable && (
                                <ScaleButton
                                  item={resource as (Deployment | StatefulSet | ReplicaSet)}
                                />
                              )}
                              {isPod && (
                                <>
                                  <AuthVisible item={resource} authVerb="get" subresource="log">
                                    <ActionButton
                                      description={t('Show Logs')}
                                      icon="mdi:file-document-box-outline"
                                      onClick={() => {
                                        Activity.launch({
                                          id: 'logs-' + resource.metadata.uid,
                                          title: t('Logs') + ': ' + resource.metadata.name,
                                          cluster: resource.cluster,
                                          icon: (
                                            <Icon
                                              icon="mdi:file-document-box-outline"
                                              width="100%"
                                              height="100%"
                                            />
                                          ),
                                          location: 'full',
                                          content: (
                                            <PodLogViewer
                                              noDialog
                                              open
                                              item={resource as Pod}
                                              onClose={() => {}}
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
                                        Activity.launch({
                                          id: 'terminal-' + resource.metadata.uid,
                                          title: resource.metadata.name,
                                          cluster: resource.cluster,
                                          icon: (
                                            <Icon icon="mdi:console" width="100%" height="100%" />
                                          ),
                                          location: 'full',
                                          content: (
                                            <Terminal
                                              item={resource as Pod}
                                              onClose={() => {
                                                /*needed for the close button to be shown*/
                                              }}
                                            />
                                          ),
                                          onClose: () => {
                                            // If we do something here, then the terminal will not be there anymore.
                                            // We just want to hide it.
                                          },
                                        });
                                      }}
                                    />
                                  </AuthVisible>
                                  <DeleteButton item={resource as Pod} />
                                </>
                              )}
                              <Typography variant="caption" color="text.secondary">
                                {ageText}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </SectionBox>
  );
}
