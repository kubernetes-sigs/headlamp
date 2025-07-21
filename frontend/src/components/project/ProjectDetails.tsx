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
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useParams } from 'react-router-dom';
import { getCluster } from '../../lib/cluster';
import ConfigMap from '../../lib/k8s/configMap';
import CronJob from '../../lib/k8s/cronJob';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import Ingress from '../../lib/k8s/ingress';
import Job from '../../lib/k8s/job';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import Secret from '../../lib/k8s/secret';
import Service from '../../lib/k8s/service';
import StatefulSet from '../../lib/k8s/statefulSet';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { deleteProject } from '../../redux/projectsSlice';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import Link from '../common/Link';
import { DeleteButton } from '../common/Resource';
import AuthVisible from '../common/Resource/AuthVisible';
import ScaleButton from '../common/Resource/ScaleButton';
import SectionBox from '../common/SectionBox';
import Terminal from '../common/Terminal';
import { PodLogViewer } from '../pod/Details';
import { getProjectResources } from './projectUtils';

interface ProjectDetailsParams {
  projectId: string;
}

export default function ProjectDetails() {
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useDispatch();
  const { projectId } = useParams<ProjectDetailsParams>();

  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const resourceListRef = React.useRef<HTMLDivElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const projectsState = useTypedSelector(state => state.projects.projects);
  const projects = Object.values(projectsState);
  const project = projects.find(p => p.id === projectId);
  const currentCluster = getCluster();
  const projectClusters = React.useMemo(() => {
    return project?.clusterSelectors?.map(selector => selector.name) || [];
  }, [project]);

  // Watch all resource types
  const { items: deployments } = Deployment.useList({ clusters: projectClusters });
  const { items: services } = Service.useList({ clusters: projectClusters });
  const { items: statefulSets } = StatefulSet.useList({ clusters: projectClusters });
  const { items: daemonSets } = DaemonSet.useList({ clusters: projectClusters });
  const { items: jobs } = Job.useList({ clusters: projectClusters });
  const { items: cronJobs } = CronJob.useList({ clusters: projectClusters });
  const { items: configMaps } = ConfigMap.useList({ clusters: projectClusters });
  const { items: secrets } = Secret.useList({ clusters: projectClusters });
  const { items: ingresses } = Ingress.useList({ clusters: projectClusters });
  const { items: pvcs } = PersistentVolumeClaim.useList({ clusters: projectClusters });
  const { items: pods } = Pod.useList({ clusters: projectClusters });

  if (!project) {
    return (
      <SectionBox title={t('Project Not Found')}>
        <Typography>{t('The requested project could not be found.')}</Typography>
        <Button onClick={() => history.push(createRouteURL('projects'))}>
          {t('Back to Projects')}
        </Button>
      </SectionBox>
    );
  }

  const handleCategorySelect = (category: string) => {
    const newCategory = category.toLowerCase();
    if (selectedCategory === newCategory) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(newCategory);
      setTimeout(() => {
        resourceListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

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
  ];

  const projectResources = getProjectResources(project, allResources, currentCluster || undefined);

  const handleEdit = () => {
    history.push(createRouteURL('project-edit', { projectId }));
  };

  const handleDelete = () => {
    dispatch(deleteProject(projectId));
    history.push(createRouteURL('projects'));
  };

  const getResourcesByKind = (kind: string) => {
    return projectResources.filter(resource => resource.kind === kind);
  };

  // Helper function to calculate health for a specific resource kind
  const calculateResourceHealth = (kind: string, resources: any[]) => {
    let healthyCount = 0;
    let unhealthyCount = 0;
    let warningCount = 0;

    if (kind === 'Deployment') {
      resources.forEach(deployment => {
        const spec = deployment.spec;
        const status = deployment.status;
        if (status?.readyReplicas === spec?.replicas && spec?.replicas > 0) {
          healthyCount++;
        } else if (status?.readyReplicas === 0) {
          unhealthyCount++;
        } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
          warningCount++;
        }
      });
    } else if (kind === 'StatefulSet') {
      resources.forEach(statefulSet => {
        const spec = statefulSet.spec;
        const status = statefulSet.status;
        if (status?.readyReplicas === spec?.replicas && spec?.replicas > 0) {
          healthyCount++;
        } else if (status?.readyReplicas === 0) {
          unhealthyCount++;
        } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
          warningCount++;
        }
      });
    } else if (kind === 'DaemonSet') {
      resources.forEach(daemonSet => {
        const status = daemonSet.status;
        if (
          status?.numberReady === status?.desiredNumberScheduled &&
          status?.desiredNumberScheduled > 0
        ) {
          healthyCount++;
        } else if (status?.numberReady === 0) {
          unhealthyCount++;
        } else if ((status?.numberReady || 0) < (status?.desiredNumberScheduled || 0)) {
          warningCount++;
        }
      });
    } else if (kind === 'Pod') {
      resources.forEach(pod => {
        const phase = pod.status?.phase;
        const conditions = pod.status?.conditions || [];
        const ready = conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

        if (phase === 'Running' && ready) {
          healthyCount++;
        } else if (phase === 'Failed' || phase === 'CrashLoopBackOff') {
          unhealthyCount++;
        } else if (phase === 'Pending' || !ready) {
          warningCount++;
        }
      });
    } else {
      // For other resource types, assume healthy if they exist
      healthyCount = resources.length;
    }

    return { healthyCount, unhealthyCount, warningCount };
  };

  // Calculate health status for the project
  const getProjectHealth = () => {
    let healthy = 0;
    let unhealthy = 0;
    let warning = 0;
    let unknown = 0;

    // Check Deployments
    const deploymentResources = getResourcesByKind('Deployment');
    deploymentResources.forEach(deployment => {
      const spec = deployment.spec;
      const status = deployment.status;
      if (status?.readyReplicas === spec?.replicas && spec?.replicas > 0) {
        healthy++;
      } else if (status?.readyReplicas === 0) {
        unhealthy++;
      } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
        warning++;
      } else {
        unknown++;
      }
    });

    // Check StatefulSets
    const statefulSetResources = getResourcesByKind('StatefulSet');
    statefulSetResources.forEach(statefulSet => {
      const spec = statefulSet.spec;
      const status = statefulSet.status;
      if (status?.readyReplicas === spec?.replicas && spec?.replicas > 0) {
        healthy++;
      } else if (status?.readyReplicas === 0) {
        unhealthy++;
      } else if ((status?.readyReplicas || 0) < (spec?.replicas || 0)) {
        warning++;
      } else {
        unknown++;
      }
    });

    // Check DaemonSets
    const daemonSetResources = getResourcesByKind('DaemonSet');
    daemonSetResources.forEach(daemonSet => {
      const status = daemonSet.status;
      if (
        status?.numberReady === status?.desiredNumberScheduled &&
        status?.desiredNumberScheduled > 0
      ) {
        healthy++;
      } else if (status?.numberReady === 0) {
        unhealthy++;
      } else if ((status?.numberReady || 0) < (status?.desiredNumberScheduled || 0)) {
        warning++;
      } else {
        unknown++;
      }
    });

    // Check Pods
    const podResources = getResourcesByKind('Pod');
    podResources.forEach(pod => {
      const phase = pod.status?.phase;
      const conditions = pod.status?.conditions || [];
      const ready = conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

      if (phase === 'Running' && ready) {
        healthy++;
      } else if (phase === 'Failed' || phase === 'CrashLoopBackOff') {
        unhealthy++;
      } else if (phase === 'Pending' || !ready) {
        warning++;
      } else {
        unknown++;
      }
    });

    const total = healthy + unhealthy + warning + unknown;
    return { healthy, unhealthy, warning, unknown, total };
  };

  const getHealthColor = (healthy: number, unhealthy: number, warning: number, total: number) => {
    if (total === 0) return 'grey.500';
    if (unhealthy > 0) return 'error.main';
    if (warning > 0) return 'warning.main';
    return 'success.main';
  };

  const getHealthIcon = (healthy: number, unhealthy: number, warning: number, total: number) => {
    if (total === 0) return 'mdi:help-circle';
    if (unhealthy > 0) return 'mdi:alert-circle';
    if (warning > 0) return 'mdi:alert';
    return 'mdi:check-circle';
  };

  const projectHealth = getProjectHealth();

  const resourceCategories = [
    {
      category: 'Workloads',
      icon: 'mdi:apps',
      kinds: ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Pod'],
      description: 'Applications and compute resources',
    },
    {
      category: 'Networking',
      icon: 'mdi:network',
      kinds: ['Service', 'Ingress'],
      description: 'Network connectivity and exposure',
    },
    {
      category: 'Configuration',
      icon: 'mdi:cog',
      kinds: ['ConfigMap', 'Secret'],
      description: 'Configuration data and secrets',
    },
    {
      category: 'Storage',
      icon: 'mdi:database',
      kinds: ['PersistentVolumeClaim'],
      description: 'Persistent data storage',
    },
  ];

  const listCategoryInfo = selectedCategory
    ? resourceCategories.find(c => c.category.toLowerCase() === selectedCategory)
    : null;

  const categoryResources = listCategoryInfo
    ? projectResources.filter(resource => listCategoryInfo.kinds.includes(resource.kind))
    : [];

  return (
    <Box pt={2}>
      <SectionBox
        title={
          <Box display="flex" alignItems="center" gap={2}>
            <Icon
              icon={project.icon || 'mdi:application'}
              width={48}
              height={48}
              style={{ color: project.color || '#1976d2' }}
            />
            <Typography variant="h4" component="span">
              {project.name}
            </Typography>
          </Box>
        }
      >
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button
            startIcon={<Icon icon="mdi:pencil" />}
            onClick={handleEdit}
            variant="outlined"
            sx={{ mr: 1 }}
          >
            {t('Edit')}
          </Button>
          <Button
            startIcon={<Icon icon="mdi:delete" />}
            onClick={() => setDeleteDialogOpen(true)}
            variant="outlined"
            color="error"
          >
            {t('Delete')}
          </Button>
        </Box>

        <Grid container spacing={3}>
          {/* Project Overview */}
          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('Project Overview')}
                </Typography>

                {project.description && (
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {project.description}
                  </Typography>
                )}

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('Health Status')}
                </Typography>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Icon
                    icon={getHealthIcon(
                      projectHealth.healthy,
                      projectHealth.unhealthy,
                      projectHealth.warning,
                      projectHealth.total
                    )}
                    style={{
                      color: getHealthColor(
                        projectHealth.healthy,
                        projectHealth.unhealthy,
                        projectHealth.warning,
                        projectHealth.total
                      ),
                      fontSize: 24,
                    }}
                  />
                  <Typography
                    variant="h6"
                    sx={{
                      color: getHealthColor(
                        projectHealth.healthy,
                        projectHealth.unhealthy,
                        projectHealth.warning,
                        projectHealth.total
                      ),
                    }}
                  >
                    {projectHealth.total === 0
                      ? t('No Workloads')
                      : projectHealth.unhealthy > 0
                      ? t('Unhealthy')
                      : projectHealth.warning > 0
                      ? t('Degraded')
                      : t('Healthy')}
                  </Typography>
                </Box>

                {projectHealth.total > 0 && (
                  <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                    {projectHealth.healthy > 0 && (
                      <Chip
                        label={`${projectHealth.healthy} ${t('Healthy')}`}
                        size="small"
                        sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}
                      />
                    )}
                    {projectHealth.warning > 0 && (
                      <Chip
                        label={`${projectHealth.warning} ${t('Warning')}`}
                        size="small"
                        sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}
                      />
                    )}
                    {projectHealth.unhealthy > 0 && (
                      <Chip
                        label={`${projectHealth.unhealthy} ${t('Unhealthy')}`}
                        size="small"
                        sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}
                      />
                    )}
                    {projectHealth.unknown > 0 && (
                      <Chip
                        label={`${projectHealth.unknown} ${t('Unknown')}`}
                        size="small"
                        sx={{ bgcolor: 'grey.300', color: 'grey.700' }}
                      />
                    )}
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('Resources')}
                </Typography>
                <Typography variant="h4" color="primary">
                  {projectResources.length}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" gutterBottom>
                  {t('Label Selectors')}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                  {project.labelSelectors.map((selector, index) => (
                    <Chip
                      key={index}
                      label={`${selector.key} ${selector.operator} ${selector.value || ''}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>

                {project.clusterSelectors && project.clusterSelectors.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Cluster Selectors')}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                      {project.clusterSelectors.map((selector, index) => (
                        <Chip
                          key={index}
                          label={selector.name || t('All Clusters')}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </>
                )}

                {project.namespaceSelectors.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Namespace Selectors')}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {project.namespaceSelectors.map((selector, index) => (
                        <Chip key={index} label={selector.name} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Resource Statistics */}
          <Grid item xs={12} md={7}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('Resource Categories')}
                </Typography>

                <List>
                  {resourceCategories.map(({ category, icon, kinds, description }) => {
                    // Calculate totals for this category
                    let totalCount = 0;
                    let totalUnhealthy = 0;
                    let totalWarning = 0;

                    kinds.forEach(kind => {
                      const resources = getResourcesByKind(kind);
                      totalCount += resources.length;

                      if (resources.length > 0) {
                        const { unhealthyCount, warningCount } = calculateResourceHealth(
                          kind,
                          resources
                        );
                        totalUnhealthy += unhealthyCount;
                        totalWarning += warningCount;
                      }
                    });

                    if (totalCount === 0) {
                      return null;
                    }

                    const healthColor =
                      totalUnhealthy > 0
                        ? 'error.main'
                        : totalWarning > 0
                        ? 'warning.main'
                        : totalCount > 0
                        ? 'success.main'
                        : 'grey.500';

                    const healthIcon =
                      totalUnhealthy > 0
                        ? 'mdi:alert-circle'
                        : totalWarning > 0
                        ? 'mdi:alert'
                        : 'mdi:check-circle';

                    return (
                      <ListItem
                        key={category}
                        disablePadding
                        secondaryAction={
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography
                              variant="h6"
                              sx={{
                                color: totalCount > 0 ? healthColor : 'text.primary',
                                lineHeight: 1,
                              }}
                            >
                              {totalCount}
                            </Typography>
                            {totalCount > 0 && (
                              <Icon
                                icon={healthIcon}
                                style={{
                                  fontSize: 20,
                                  color: healthColor,
                                }}
                              />
                            )}
                          </Box>
                        }
                      >
                        <ListItemButton
                          onClick={() => handleCategorySelect(category)}
                          selected={selectedCategory === category.toLowerCase()}
                        >
                          <ListItemIcon>
                            <Icon icon={icon} style={{ fontSize: 32 }} />
                          </ListItemIcon>
                          <ListItemText primary={category} secondary={description} />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <div ref={resourceListRef} style={{ minHeight: '20px' }} />

        {selectedCategory && listCategoryInfo && (
          <Box mt={4}>
            <SectionBox
              title={
                <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                  <Typography variant="h5">{listCategoryInfo.category}</Typography>
                  <IconButton onClick={() => setSelectedCategory(null)} size="small">
                    <Icon icon="mdi:close" />
                  </IconButton>
                </Box>
              }
            >
              {categoryResources.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('No {{category}} resources found for this project.', {
                    category: listCategoryInfo.category.toLowerCase(),
                  })}
                </Typography>
              ) : (
                <Box>
                  {listCategoryInfo.kinds.map(kind => {
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
                              } else if (
                                (status?.numberReady || 0) < (status?.desiredNumberScheduled || 0)
                              ) {
                                healthColor = 'warning.main';
                                healthIcon = 'mdi:alert';
                                healthText = 'Degraded';
                              }
                            } else if (kind === 'Pod') {
                              const pod = resource as Pod;
                              const phase = pod.status?.phase;
                              const conditions = pod.status?.conditions || [];
                              const ready =
                                conditions.find((c: any) => c.type === 'Ready')?.status === 'True';

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

                            const createdDate = resource.metadata?.creationTimestamp
                              ? new Date(resource.metadata.creationTimestamp)
                              : null;
                            const ageText = createdDate
                              ? Math.floor(
                                  (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
                                ) + 'd'
                              : 'Unknown';
                            const isScalable = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(
                              kind
                            );
                            const isPod = kind === 'Pod';

                            return (
                              <Box
                                key={`${resource.metadata?.namespace || 'default'}-${
                                  resource.metadata?.name
                                }-${index}`}
                                p={2}
                                border={1}
                                borderColor="divider"
                                borderRadius={1}
                                sx={{
                                  '&:hover': { bgcolor: 'action.hover' },
                                }}
                              >
                                <Box
                                  display="flex"
                                  justifyContent="space-between"
                                  alignItems="center"
                                >
                                  <Box flex={1}>
                                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                      <Link kubeObject={resource}>
                                        <Typography
                                          variant="body1"
                                          fontWeight="medium"
                                          component="span"
                                        >
                                          {resource.metadata?.name}
                                        </Typography>
                                      </Link>
                                      <Icon
                                        icon={healthIcon}
                                        style={{
                                          fontSize: 16,
                                          color: healthColor,
                                        }}
                                      />
                                      <Typography variant="caption" sx={{ color: healthColor }}>
                                        {healthText}
                                      </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                      {resource.metadata?.namespace &&
                                        `Namespace: ${resource.metadata.namespace}`}
                                      {resource.metadata?.namespace && ' • '}
                                      Cluster: {resource.cluster || 'default'}
                                      {['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind) &&
                                        resource.status &&
                                        ` • Replicas: ${
                                          resource.status.readyReplicas ||
                                          resource.status.availableReplicas ||
                                          0
                                        }/${resource.spec?.replicas || 0}`}
                                      {kind === 'DaemonSet' &&
                                        resource.status &&
                                        ` • Ready: ${resource.status.numberReady || 0}/${
                                          resource.status.desiredNumberScheduled || 0
                                        }`}
                                      {kind === 'Pod' &&
                                        resource.status?.phase &&
                                        ` • Phase: ${resource.status.phase}`}
                                    </Typography>
                                  </Box>
                                  <Box textAlign="right" display="flex" alignItems="center" gap={1}>
                                    {isScalable && (
                                      <ScaleButton
                                        item={resource as Deployment | StatefulSet | ReplicaSet}
                                      />
                                    )}
                                    {isPod && (
                                      <>
                                        <AuthVisible
                                          item={resource}
                                          authVerb="get"
                                          subresource="log"
                                        >
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
                                        <AuthVisible
                                          item={resource}
                                          authVerb="create"
                                          subresource="exec"
                                        >
                                          <ActionButton
                                            description={t('Terminal / Exec')}
                                            icon="mdi:console"
                                            onClick={() => {
                                              Activity.launch({
                                                id: 'terminal-' + resource.metadata.uid,
                                                title: resource.metadata.name,
                                                cluster: resource.cluster,
                                                icon: (
                                                  <Icon
                                                    icon="mdi:console"
                                                    width="100%"
                                                    height="100%"
                                                  />
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
            </SectionBox>
          </Box>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>{t('Delete Project')}</DialogTitle>
          <DialogContent>
            <Typography>
              {t(
                'Are you sure you want to delete the project "{{name}}"? This action cannot be undone.',
                {
                  name: project.name,
                }
              )}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>{t('Cancel')}</Button>
            <Button onClick={handleDelete} color="error" variant="contained">
              {t('Delete')}
            </Button>
          </DialogActions>
        </Dialog>
      </SectionBox>
    </Box>
  );
}
