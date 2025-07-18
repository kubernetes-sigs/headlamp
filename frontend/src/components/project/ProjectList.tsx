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

import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Typography, Card, CardContent, Grid, Chip } from '@mui/material';
import { Icon } from '@iconify/react';
import { useTypedSelector } from '../../redux/hooks';
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

interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  resourceCount: number;
  namespaces: string[];
  labelSelectors: string[];
}

export default function ProjectList() {
  const { t } = useTranslation();
  const history = useHistory();
  const projectsState = useTypedSelector(state => state.projects.projects);
  const projects = Object.values(projectsState);
  const currentCluster = getCluster();

  const allProjectClusters = useMemo(() => {
    const clusterNames = new Set<string>();
    projects.forEach(p => {
      if (p.clusterSelectors && p.clusterSelectors.length > 0) {
        p.clusterSelectors.forEach(s => {
          if (s.name) {
            clusterNames.add(s.name);
          }
        });
      }
    });
    return Array.from(clusterNames);
  }, [projects]);

  // Watch all resource types
  const { items: deployments } = Deployment.useList({ clusters: allProjectClusters });
  const { items: services } = Service.useList({ clusters: allProjectClusters });
  const { items: statefulSets } = StatefulSet.useList({ clusters: allProjectClusters });
  const { items: daemonSets } = DaemonSet.useList({ clusters: allProjectClusters });
  const { items: jobs } = Job.useList({ clusters: allProjectClusters });
  const { items: cronJobs } = CronJob.useList({ clusters: allProjectClusters });
  const { items: configMaps } = ConfigMap.useList({ clusters: allProjectClusters });
  const { items: secrets } = Secret.useList({ clusters: allProjectClusters });
  const { items: ingresses } = Ingress.useList({ clusters: allProjectClusters });
  const { items: pvcs } = PersistentVolumeClaim.useList({ clusters: allProjectClusters });
  const { items: pods } = Pod.useList({ clusters: allProjectClusters });

  const allResources = useMemo(() => [
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
  ], [deployments, services, statefulSets, daemonSets, jobs, cronJobs, configMaps, secrets, ingresses, pvcs, pods]);

  const projectSummaries = useMemo((): ProjectSummary[] => {
    return projects.map(project => {
      const projectResources = getProjectResources(project, allResources, currentCluster || undefined);
      const namespaces = Array.from(new Set(projectResources.map(r => r.getNamespace()).filter(Boolean)));
      const labelSelectors = project.labelSelectors.map(sel =>
        `${sel.key} ${sel.operator} ${sel.value || ''}`
      );

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        icon: project.icon,
        resourceCount: projectResources.length,
        namespaces,
        labelSelectors,
      };
    });
  }, [projects, allResources]);

  const handleCreateProject = () => {
    history.push(createRouteURL('projectCreate'));
  };

  const handleProjectClick = (projectId: string) => {
    history.push(createRouteURL('projectDetails', { projectId }));
  };

  if (projects.length === 0) {
    return (
      <SectionBox title={t('Projects')}>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="400px"
          textAlign="center"
        >
          <Icon icon="mdi:folder-multiple" style={{ fontSize: 64, color: '#ccc', marginBottom: 16 }} />
          <Typography variant="h6" gutterBottom>
            {t('No projects found')}
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {t('Create your first project to organize your Kubernetes resources')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Icon icon="mdi:plus" />}
            onClick={handleCreateProject}
          >
            {t('Create Project')}
          </Button>
        </Box>
      </SectionBox>
    );
  }

  return (
    <SectionBox title={t('Projects')}>
      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button
          variant="contained"
          startIcon={<Icon icon="mdi:plus" />}
          onClick={handleCreateProject}
        >
          {t('Create Project')}
        </Button>
      </Box>

      <Grid container spacing={3}>
        {projectSummaries.map(project => (
          <Grid item xs={12} md={6} lg={4} key={project.id}>
            <Card
              sx={{
                height: '100%',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 3,
                },
              }}
              onClick={() => handleProjectClick(project.id)}
            >
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Icon
                    icon={project.icon || 'mdi:application'}
                    style={{ fontSize: 32, color: project.color || '#1976d2' }}
                  />
                  <Box>
                    <Typography variant="h6" component="h2">
                      {project.name}
                    </Typography>
                    {project.description && (
                      <Typography variant="body2" color="text.secondary">
                        {project.description}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Typography variant="h4" color="primary">
                    {project.resourceCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('Resources')}
                  </Typography>
                </Box>

                {project.namespaces.length > 0 && (
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {t('Namespaces')}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {project.namespaces.slice(0, 3).map(namespace => (
                        <Chip
                          key={namespace}
                          label={namespace}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                      {project.namespaces.length > 3 && (
                        <Chip
                          label={`+${project.namespaces.length - 3} more`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  </Box>
                )}

                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {t('Label Selectors')}
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {project.labelSelectors.slice(0, 2).map((selector, index) => (
                      <Chip
                        key={index}
                        label={selector}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                    {project.labelSelectors.length > 2 && (
                      <Chip
                        label={`+${project.labelSelectors.length - 2} more`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </SectionBox>
  );
}
