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
import { Box, Button, Card, CardContent, Grid, Tab, Tabs, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Namespace from '../../lib/k8s/namespace';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import Role from '../../lib/k8s/role';
import RoleBinding from '../../lib/k8s/roleBinding';
import { SelectedClustersContext } from '../../lib/k8s/SelectedClustersContext';
import { useTypedSelector } from '../../redux/hooks';
import { ProjectDefinition } from '../../redux/projectsSlice';
import { Activity } from '../activity/Activity';
import { EditButton, EditorDialog, Loader, StatusLabel } from '../common';
import DeleteMultipleButton from '../common/Resource/DeleteMultipleButton';
import ResourceTable from '../common/Resource/ResourceTable';
import SectionBox from '../common/SectionBox';
import { GraphFilter } from '../resourceMap/graph/graphFiltering';
import { GraphView } from '../resourceMap/GraphView';
import { ResourceQuotaTable } from '../resourceQuota/Details';
import { useProject } from './ProjectList';
import { ProjectResourcesTab, useResourceCategoriesList } from './ProjectResourcesTab';
import { getHealthIcon, getResourcesHealth } from './projectUtils';
import { ResourceCategoriesList } from './ResourceCategoriesList';
import { useProjectItems } from './useProjectResources';

interface ProjectDetailsParams {
  name: string;
}

export default function ProjectDetails() {
  const { t } = useTranslation();
  const { name } = useParams<ProjectDetailsParams>();
  const { project, isLoading: isProjectLoading } = useProject(name);

  if (isProjectLoading || !project || !name) {
    return <Loader title={t('Loading')} />;
  }
  // Key is provided to make sure we remount this component
  return <ProjectDetailsContent key={name} project={project} />;
}

/**
 * Project Details page
 */
function ProjectDetailsContent({ project }: { project: ProjectDefinition }) {
  const { t } = useTranslation();
  const { name } = useParams<ProjectDetailsParams>();
  const additionalTabs = Object.values(useTypedSelector(state => state.projects.detailsTabs));
  const additionalOverviewSections = Object.values(
    useTypedSelector(state => state.projects.overviewSections)
  );
  const [selectedTab, setSelectedTab] = useState('overview');
  const [allNamespaces] = Namespace.useList({ clusters: project.clusters });
  const [selectedCategoryName, setSelectedCategoryName] = React.useState<string>();

  const { items, isLoading } = useProjectItems(project);

  const resourceQuotas = useMemo(
    () => (items?.filter(it => it.kind === 'ResourceQuota') as ResourceQuota[]) ?? [],
    [items]
  );

  const projectHealth = useMemo(() => getResourcesHealth(items), [items]);
  const categoryList = useResourceCategoriesList(items);

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
            <Typography variant="h5" component="span" sx={{ mr: 'auto' }}>
              {project.id}
            </Typography>

            <DeleteMultipleButton
              items={allNamespaces?.filter(it => project.namespaces.includes(it.metadata.name))}
            />
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
              value="access"
              label={
                <>
                  <Icon icon="mdi:account-lock" />
                  <Typography>
                    <Trans>Access</Trans>
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
            <Grid item xs={12} md={4}>
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
                      {items.length > 0 && (
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

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{t('Resources')}</Typography>
                  <ResourceCategoriesList
                    categoryList={categoryList}
                    onCategoryClick={category => {
                      setSelectedCategoryName(category);
                      setSelectedTab('resources');
                    }}
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{t('Resource Quotas')}</Typography>
                  <Box>
                    {resourceQuotas.map(it => (
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="h6" sx={{ mr: 'auto' }}>
                            {it.metadata.name}
                          </Typography>
                          <EditButton item={it} />
                        </Box>
                        <ResourceQuotaTable resourceStats={it.resourceStats} />
                      </Box>
                    ))}

                    {resourceQuotas.length === 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          flexDirection: 'column',
                          my: 2,
                        }}
                      >
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {t(
                            'Create Resource Quota to limit resource consumption within this project'
                          )}
                        </Typography>
                        <Button
                          startIcon={<Icon icon="mdi:plus" />}
                          color="secondary"
                          variant="contained"
                          onClick={() => {
                            const activityId = 'create-resource-resourcequotas';
                            const item = ResourceQuota.getBaseObject();
                            item.metadata.namespace = project.namespaces[0];
                            item.cluster = project.clusters[0];

                            Activity.launch({
                              id: activityId,
                              title: t('translation|Create {{ name }}', {
                                name: ResourceQuota.kind,
                              }),
                              location: 'full',
                              cluster: project.clusters[0],
                              icon: <Icon icon="mdi:plus-circle" />,
                              content: (
                                <EditorDialog
                                  noDialog
                                  item={item}
                                  open
                                  setOpen={() => {}}
                                  onClose={() => Activity.close(activityId)}
                                  saveLabel={t('translation|Apply')}
                                  title={t('translation|Create {{ name }}', { name })}
                                  aria-label={t('translation|Create {{ name }}', { name })}
                                />
                              ),
                            });
                          }}
                        >
                          <Trans>Create resource quota</Trans>
                        </Button>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {additionalOverviewSections.map(section => (
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <section.component
                      key={section.id}
                      project={project}
                      projectResources={items}
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {selectedTab === 'resources' && (
          <ProjectResourcesTab
            projectResources={items}
            showClusterColumn={project.clusters.length > 1}
            selectedCategoryName={selectedCategoryName}
            setSelectedCategoryName={setSelectedCategoryName}
          />
        )}
        {selectedTab === 'access' && (
          <Box sx={{ my: 3 }}>
            <SelectedClustersContext.Provider value={project.clusters}>
              <Typography variant="h6">{t('Roles')}</Typography>
              <ResourceTable
                resourceClass={Role}
                columns={['type', 'name', 'age']}
                namespaces={project.namespaces}
                enableRowActions
              />
              <Typography variant="h6">{t('Role Bindings')}</Typography>
              <ResourceTable
                resourceClass={RoleBinding}
                columns={['type', 'name', 'age']}
                namespaces={project.namespaces}
                enableRowActions
              />
            </SelectedClustersContext.Provider>
          </Box>
        )}
        {selectedTab === 'map' && (
          <ProjectGraph namespaces={project.namespaces} clusters={project.clusters} />
        )}
        {additionalTabs.map(tab =>
          selectedTab === tab.id ? (
            <tab.component key={tab.id} project={project} projectResources={items} />
          ) : null
        )}
      </SectionBox>
    </Box>
  );
}

function ProjectGraph({ namespaces, clusters }: { namespaces: string[]; clusters: string[] }) {
  const filters = useMemo(
    () =>
      [
        namespaces.length > 0
          ? {
              type: 'namespace',
              namespaces: new Set(namespaces),
            }
          : undefined,
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
