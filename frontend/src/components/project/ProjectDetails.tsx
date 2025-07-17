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

import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  Box,
  Button,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  Tab,
  Tabs,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Icon } from '@iconify/react';
import LightTooltip from '../common/Tooltip/TooltipLight';
import { useTypedSelector } from '../../redux/hooks';
import { deleteProject } from '../../redux/projectsSlice';
import { createRouteURL } from '../../lib/router';
import { getProjectResources } from './projectUtils';
import { getCluster } from '../../lib/cluster';
import SectionBox from '../common/SectionBox';
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

interface ProjectDetailsParams {
  projectId: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`project-tabpanel-${index}`}
      aria-labelledby={`project-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function ProjectDetails() {
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useDispatch();
  const { projectId } = useParams<ProjectDetailsParams>();

  const [activeTab, setActiveTab] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
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
        if (status?.numberReady === status?.desiredNumberScheduled && status?.desiredNumberScheduled > 0) {
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
      if (status?.numberReady === status?.desiredNumberScheduled && status?.desiredNumberScheduled > 0) {
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
      scalingNotice: 'Workloads can be scaled up or down based on demand'
    },
    {
      category: 'Networking',
      icon: 'mdi:network',
      kinds: ['Service', 'Ingress'],
      description: 'Network connectivity and exposure',
      scalingNotice: 'Network resources typically scale with workloads'
    },
    {
      category: 'Configuration',
      icon: 'mdi:cog',
      kinds: ['ConfigMap', 'Secret'],
      description: 'Configuration data and secrets',
      scalingNotice: 'Configuration resources are usually static'
    },
    {
      category: 'Storage',
      icon: 'mdi:database',
      kinds: ['PersistentVolumeClaim'],
      description: 'Persistent data storage',
      scalingNotice: 'Storage can be expanded but rarely shrunk'
    }
  ];

  return (
    <Box pt={2}>
      <SectionBox
        title={
          <Box display="flex" alignItems="center" gap={2}>
            <Icon icon={project.icon || 'mdi:application'} width={48} height={48} style={{ color: project.color || '#1976d2' }} />
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
          <Grid item xs={12} md={4}>
            <Card>
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
                    icon={getHealthIcon(projectHealth.healthy, projectHealth.unhealthy, projectHealth.warning, projectHealth.total)}
                    style={{
                      color: getHealthColor(projectHealth.healthy, projectHealth.unhealthy, projectHealth.warning, projectHealth.total),
                      fontSize: 24
                    }}
                  />
                  <Typography variant="h6" sx={{
                    color: getHealthColor(projectHealth.healthy, projectHealth.unhealthy, projectHealth.warning, projectHealth.total)
                  }}>
                    {projectHealth.total === 0 ? t('No Workloads') :
                    projectHealth.unhealthy > 0 ? t('Unhealthy') :
                    projectHealth.warning > 0 ? t('Degraded') : t('Healthy')}
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
                        <Chip
                          key={index}
                          label={selector.name}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Resource Statistics */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('Resource Categories')}
                </Typography>

                <Grid container spacing={2}>
                  {resourceCategories
                    .filter(({ kinds }) => kinds.some(kind => getResourcesByKind(kind).length > 0))
                    .map(({ category, icon, kinds, description, scalingNotice }) => {
                      // Calculate totals for this category
                      let totalCount = 0;
                      let totalHealthy = 0;
                      let totalUnhealthy = 0;
                      let totalWarning = 0;

                      kinds.forEach(kind => {
                        const resources = getResourcesByKind(kind);
                        totalCount += resources.length;

                        if (resources.length > 0) {
                          const { healthyCount, unhealthyCount, warningCount } = calculateResourceHealth(kind, resources);
                          totalHealthy += healthyCount;
                          totalUnhealthy += unhealthyCount;
                          totalWarning += warningCount;
                        }
                      });

                      const healthColor = totalUnhealthy > 0 ? 'error.main' :
                                        totalWarning > 0 ? 'warning.main' :
                                        totalCount > 0 ? 'success.main' : 'grey.500';

                      const hasUnhealthyResources = totalUnhealthy > 0 || totalWarning > 0;
                      const healthIcon = totalUnhealthy > 0 ? 'mdi:alert-circle' :
                                        totalWarning > 0 ? 'mdi:alert' : 'mdi:check-circle';

                      return (
                        <Grid item xs={12} sm={6} md={6} key={category}>
                          <LightTooltip title={totalCount > 0 ? t('Click to view {{category}} resources', { category }) : ''}>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 2,
                                cursor: totalCount > 0 ? 'pointer' : 'default',
                                borderColor: totalCount > 0 ? healthColor : 'grey.300',
                                borderWidth: totalCount > 0 ? 2 : 1,
                                '&:hover': totalCount > 0 ? {
                                  bgcolor: 'action.hover',
                                  boxShadow: 2,
                                  transform: 'translateY(-1px)',
                                  transition: 'all 0.2s ease-in-out'
                                } : {},
                                transition: 'all 0.2s ease-in-out'
                              }}
                              onClick={() => {
                                if (totalCount > 0) {
                                  history.push(createRouteURL('projectResources', {
                                    projectId,
                                    category: category.toLowerCase()
                                  }));
                                }
                              }}
                            >
                            <Box display="flex" alignItems="flex-start" gap={2}>
                              <Box display="flex" alignItems="center" justifyContent="center" p={1}>
                                <Icon icon={icon} style={{ fontSize: 32 }} />
                              </Box>

                              <Box flex={1}>
                                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                                  <Typography variant="h6" component="div">
                                    {category}
                                  </Typography>
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <Typography variant="h6" sx={{
                                      color: totalCount > 0 ? healthColor : 'text.primary',
                                      lineHeight: 1
                                    }}>
                                      {totalCount > 0 ? (
                                        hasUnhealthyResources ? `${totalHealthy}/${totalCount}` : totalCount
                                      ) : totalCount}
                                    </Typography>
                                    {totalCount > 0 && (
                                      <Icon
                                        icon={healthIcon}
                                        style={{
                                          fontSize: 20,
                                          color: healthColor,
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                      />
                                    )}
                                  </Box>
                                </Box>

                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                  {description}
                                </Typography>

                                <Typography variant="caption" color="text.secondary" sx={{
                                  fontStyle: 'italic',
                                  display: 'block',
                                  fontSize: '0.75rem'
                                }}>
                                  💡 {scalingNotice}
                                </Typography>

                                {totalCount > 0 && (
                                  <Box mt={1}>
                                    <Typography variant="body2" color="text.secondary">
                                      {kinds
                                        .filter(kind => getResourcesByKind(kind).length > 0)
                                        .map(kind => `${getResourcesByKind(kind).length} ${kind}${getResourcesByKind(kind).length !== 1 ? 's' : ''}`)
                                        .join(', ')}
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </Paper>
                          </LightTooltip>
                        </Grid>
                      );
                    })}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Resource Details */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('Resource Overview')}
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('Total resources matching this project: {{count}}', { count: projectResources.length })}
                </Typography>

                {projectResources.length > 0 && (
                  <Box mt={2}>
                    <Grid container spacing={2}>
                      {resourceCategories.map(({ category, kinds }) => {
                        const categoryResources = kinds.flatMap(kind => getResourcesByKind(kind));
                        if (categoryResources.length === 0) return null;

                        return (
                          <Grid item xs={12} sm={6} md={3} key={category}>
                            <Box>
                              <Typography variant="subtitle2" color="primary" gutterBottom>
                                {category}
                              </Typography>
                              {kinds.map(kind => {
                                const resources = getResourcesByKind(kind);
                                if (resources.length === 0) return null;
                                return (
                                  <Typography key={kind} variant="body2" color="text.secondary">
                                    {resources.length} {kind}{resources.length !== 1 ? 's' : ''}
                                  </Typography>
                                );
                              })}
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {t('Delete Project')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('Are you sure you want to delete the project "{{name}}"? This action cannot be undone.', {
                name: project.name,
              })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleDelete} color="error" variant="contained">
              {t('Delete')}
            </Button>
          </DialogActions>
        </Dialog>
      </SectionBox>
    </Box>
  );
}
