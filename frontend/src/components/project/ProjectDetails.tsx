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
  Grid,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useParams } from 'react-router-dom';
import { SelectedClustersContext } from '../../lib/k8s/SelectedClustersContext';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { deleteProject } from '../../redux/projectsSlice';
import { Loader, StatusLabel } from '../common';
import SectionBox from '../common/SectionBox';
import { GraphFilter } from '../resourceMap/graph/graphFiltering';
import { GraphView } from '../resourceMap/GraphView';
import { ProjectResourcesTab } from './ProjectResourcesTab';
import { getHealthIcon, getProjectResources, getResourcesHealth } from './projectUtils';
import { useProjectResources } from './useProjectResources';

interface ProjectDetailsParams {
  projectId: string;
}

export default function ProjectDetails() {
  const { projectId } = useParams<ProjectDetailsParams>();

  // Key is provided to make sure we remount this component
  return <ProjectDetailsContent key={projectId} />;
}

/**
 * Project Details page
 */
function ProjectDetailsContent() {
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useDispatch();
  const { projectId } = useParams<ProjectDetailsParams>();
  const additionalTabs = Object.values(useTypedSelector(state => state.projects.detailsTabs));
  const additionalOverviewSections = Object.values(
    useTypedSelector(state => state.projects.overviewSections)
  );
  const [selectedTab, setSelectedTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const projectsState = useTypedSelector(state => state.projects.projects);
  const projects = Object.values(projectsState);
  const project = projects.find(p => p.id === projectId)!;

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

  const { items, isLoading } = useProjectResources(project);

  const projectResources = useMemo(() => getProjectResources(project, items), [project, items]);

  const handleEdit = () => {
    history.push(createRouteURL('projectEdit', { projectId }));
  };

  const handleDelete = () => {
    dispatch(deleteProject(projectId));
    history.push(createRouteURL('projects'));
  };

  const projectHealth = useMemo(() => getResourcesHealth(projectResources), [projectResources]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    setSelectedTab(newValue);
  };

  if (isLoading) {
    return <Loader title={t('Loading')} />;
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'flex-start' }}
    >
      <SectionBox
        outterBoxProps={{
          sx: { flexGrow: 1, display: 'flex', flexDirection: 'column', width: '100%' },
        }}
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          mb: 3,
        }}
        backLink
        title={
          <Box display="flex" alignItems="center" gap={1} sx={{ py: 2 }}>
            <Icon
              icon={project.icon || 'mdi:application'}
              width={32}
              height={32}
              style={{ color: project.color || '#1976d2' }}
            />
            <Typography variant="h5" component="span">
              {project.name}
            </Typography>

            <Button
              startIcon={<Icon icon="mdi:pencil" />}
              onClick={handleEdit}
              variant="contained"
              color="secondary"
              sx={{ ml: 'auto' }}
            >
              {t('Edit')}
            </Button>
            <Button
              startIcon={<Icon icon="mdi:delete" />}
              onClick={() => setDeleteDialogOpen(true)}
              variant="contained"
              color="error"
            >
              {t('Delete')}
            </Button>
          </Box>
        }
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={selectedTab} onChange={handleTabChange}>
            <Tab
              value="overview"
              label={
                <>
                  <Icon icon="mdi:view-dashboard" />
                  <Typography>
                    <Trans>Overview</Trans>
                  </Typography>
                </>
              }
              sx={{
                flexDirection: 'row',
                gap: 1,
                fontSize: '1.25rem',
              }}
            />
            <Tab
              value="resources"
              label={
                <>
                  <Icon icon="mdi:format-list-bulleted" />
                  <Typography>
                    <Trans>Resources</Trans>
                  </Typography>
                </>
              }
              sx={{
                flexDirection: 'row',
                gap: 1,
                fontSize: '1.25rem',
              }}
            />
            <Tab
              value="map"
              label={
                <>
                  <Icon icon="mdi:map" />
                  <Typography>
                    <Trans>Map</Trans>
                  </Typography>
                </>
              }
              sx={{
                flexDirection: 'row',
                gap: 1,
                fontSize: '1.25rem',
              }}
            />
            {additionalTabs.map(tab => (
              <Tab
                key={tab.id}
                value={tab.id}
                label={
                  <>
                    {typeof tab.icon === 'string' ? <Icon icon={tab.icon} /> : tab.icon}
                    <Typography>{tab.label}</Typography>
                  </>
                }
                sx={{
                  flexDirection: 'row',
                  gap: 1,
                  fontSize: '1.25rem',
                }}
              />
            ))}
          </Tabs>
        </Box>
        {selectedTab === 'overview' && (
          <Grid container spacing={3} sx={{ pt: 2 }}>
            <Grid item xs={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{t('Status')}</Typography>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {t('Project Status')}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <StatusLabel
                          status={
                            projectHealth.error > 0
                              ? 'error'
                              : projectHealth.warning > 0
                              ? 'warning'
                              : 'success'
                          }
                        >
                          <Icon
                            icon={getHealthIcon(
                              projectHealth.success,
                              projectHealth.error,
                              projectHealth.warning
                            )}
                            style={{
                              fontSize: 24,
                            }}
                          />
                          {projectHealth.success === 0
                            ? t('No Workloads')
                            : projectHealth.error > 0
                            ? t('Unhealthy')
                            : projectHealth.warning > 0
                            ? t('Degraded')
                            : t('Healthy')}
                        </StatusLabel>
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {t('Resources')}
                      </Typography>
                      {projectResources.length > 0 && (
                        <Box display="flex" flexWrap="wrap" gap={1}>
                          {projectHealth.success > 0 && (
                            <StatusLabel status="success">
                              {projectHealth.success} {t('Healthy')}
                            </StatusLabel>
                          )}
                          {projectHealth.warning > 0 && (
                            <StatusLabel status="warning">
                              {projectHealth.warning} {t('Warning')}
                            </StatusLabel>
                          )}
                          {projectHealth.error > 0 && (
                            <StatusLabel status="error">
                              {projectHealth.error} {t('Unhealthy')}
                            </StatusLabel>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {t('Project Selectors')}
                  </Typography>
                  {Object.keys(project.labelSelectors).length > 0 && (
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Labels')}:
                      {Object.entries(project.labelSelectors).map(([key, selector]) => (
                        <Chip
                          key={key + selector.value}
                          label={`${key} ${selector.operator} ${selector.value || ''}`}
                          variant="outlined"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      ))}
                    </Typography>
                  )}

                  {project.clusterSelectors && project.clusterSelectors.length > 0 && (
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Clusters')}:
                      {project.clusterSelectors.map(s => (
                        <Chip
                          label={s.value}
                          key={s.value}
                          variant="outlined"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      ))}
                    </Typography>
                  )}

                  {project.namespaceSelectors.length > 0 && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        {t('Namespace Selectors')}:{' '}
                        {project.namespaceSelectors.map(s => (
                          <Chip
                            label={s.value}
                            key={s.value}
                            variant="outlined"
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        ))}
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}></Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {additionalOverviewSections.map(section => (
              <section.component
                key={section.id}
                project={project}
                projectResources={projectResources}
              />
            ))}
          </Grid>
        )}

        {selectedTab === 'resources' && (
          <ProjectResourcesTab
            projectResources={projectResources}
            showClusterColumn={project.clusterSelectors.length > 0}
          />
        )}
        {selectedTab === 'map' && (
          <ProjectGraph
            namespaces={project.namespaceSelectors.map(it => it.value)}
            clusters={project.clusterSelectors.map(it => it.value)}
            labels={Object.entries(project.labelSelectors).map(([key, selector]) => ({
              key,
              value: selector.value,
            }))}
          />
        )}
        {additionalTabs.map(tab =>
          selectedTab === tab.id ? (
            <tab.component key={tab.id} project={project} projectResources={projectResources} />
          ) : null
        )}
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

function ProjectGraph({
  namespaces,
  labels,
  clusters,
}: {
  namespaces: string[];
  clusters: string[];
  labels: { key: string; value: string }[];
}) {
  const filters = useMemo(
    () =>
      [
        namespaces.length > 0
          ? {
              type: 'namespace',
              namespaces: new Set(namespaces),
            }
          : undefined,
        ...labels.map(it => ({ type: 'label', key: it.key, value: it.value })),
      ].filter(Boolean) as GraphFilter[],
    [namespaces, clusters]
  );
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderTop: 0,
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SelectedClustersContext.Provider value={clusters}>
        <GraphView defaultFilters={filters} />
      </SelectedClustersContext.Provider>
    </Box>
  );
}
