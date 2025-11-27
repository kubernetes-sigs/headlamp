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
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { KubeObject } from '../../lib/k8s/KubeObject';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import Role from '../../lib/k8s/role';
import RoleBinding from '../../lib/k8s/roleBinding';
import { SelectedClustersContext } from '../../lib/k8s/SelectedClustersContext';
import { useTypedSelector } from '../../redux/hooks';
import { ProjectDefinition, ProjectDetailsTab } from '../../redux/projectsSlice';
import { Activity } from '../activity/Activity';
import { ButtonStyle, EditButton, EditorDialog, Loader, StatusLabel } from '../common';
import Link from '../common/Link';
import ResourceTable from '../common/Resource/ResourceTable';
import SectionBox from '../common/SectionBox';
import { GraphFilter } from '../resourceMap/graph/graphFiltering';
import { GraphView } from '../resourceMap/GraphView';
import { ResourceQuotaTable } from '../resourceQuota/Details';
import { ProjectDeleteButton } from './ProjectDeleteButton';
import { useProject } from './ProjectList';
import { ProjectResourcesTab, useResourceCategoriesList } from './ProjectResourcesTab';
import { getHealthIcon, getResourcesHealth } from './projectUtils';
import { ResourceCategoriesList } from './ResourceCategoriesList';
import { useProjectItems } from './useProjectResources';

interface ProjectDetailsParams {
  name: string;
}

// Tab ID constants
const TAB_IDS = {
  OVERVIEW: 'headlamp-projects.tabs.overview',
  RESOURCES: 'headlamp-projects.tabs.resources',
  ACCESS: 'headlamp-projects.tabs.access',
  MAP: 'headlamp-projects.tabs.map',
} as const;

// Default tabs configuration with their IDs
const DEFAULT_TABS: Record<string, ProjectDetailsTab> = {
  [TAB_IDS.OVERVIEW]: {
    id: TAB_IDS.OVERVIEW,
    icon: 'mdi:view-dashboard',
    label: <Trans>Overview</Trans>,
    component: ProjectOverview,
  },
  [TAB_IDS.RESOURCES]: {
    id: TAB_IDS.RESOURCES,
    icon: 'mdi:format-list-bulleted',
    label: <Trans>Resources</Trans>,
    component: ProjectResources,
  },
  [TAB_IDS.ACCESS]: {
    id: TAB_IDS.ACCESS,
    icon: 'mdi:account-lock',
    label: <Trans>Access</Trans>,
    component: ProjectAccess,
  },
  [TAB_IDS.MAP]: {
    id: TAB_IDS.MAP,
    icon: 'mdi:map',
    label: <Trans>Map</Trans>,
    component: ProjectGraph,
  },
};

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

function ProjectOverview({
  project,
  projectResources,
}: {
  project: ProjectDefinition;
  projectResources: KubeObject[];
}) {
  const { t } = useTranslation();
  const detailsContext = useContext(ProjectDetailsContext);
  if (!detailsContext) {
    throw new Error('Missing ProjectDetailsContext');
  }
  const { setSelectedCategoryName, setSelectedTab } = detailsContext;
  const additionalOverviewSections = Object.values(
    useTypedSelector(state => state.projects.overviewSections)
  );
  const resourceQuotas = useMemo(
    () => (projectResources?.filter(it => it.kind === 'ResourceQuota') as ResourceQuota[]) ?? [],
    [projectResources]
  );

  const categoryList = useResourceCategoriesList(projectResources);

  const projectHealth = useMemo(() => getResourcesHealth(projectResources), [projectResources]);

  return (
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
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {project.clusters.length === 1
                  ? t('translation|Cluster')
                  : t('translation|Clusters')}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
                {project.clusters.map(cluster => (
                  <Link key={cluster} routeName="cluster" params={{ cluster }}>
                    {cluster}
                  </Link>
                ))}
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
                setSelectedTab(TAB_IDS.RESOURCES);
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
                    {t('Create Resource Quota to limit resource consumption within this project')}
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
                projectResources={projectResources}
              />
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

/** Resources tab for the Project Details */
function ProjectResources({
  project,
  projectResources,
}: {
  project: ProjectDefinition;
  projectResources: KubeObject[];
}) {
  const detailsContext = useContext(ProjectDetailsContext);
  if (!detailsContext) {
    throw new Error('Missing ProjectDetailsContext');
  }
  const { selectedCategoryName, setSelectedCategoryName } = detailsContext;

  return (
    <ProjectResourcesTab
      projectResources={projectResources}
      showClusterColumn={project.clusters.length > 1}
      selectedCategoryName={selectedCategoryName}
      setSelectedCategoryName={setSelectedCategoryName}
    />
  );
}

/** Access tab for the Project Details */
function ProjectAccess({ project }: { project: ProjectDefinition }) {
  const { t } = useTranslation();
  return (
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
  );
}

/** Context for Project Details page state that can be shared with different tabs */
const ProjectDetailsContext = createContext<
  | {
      selectedCategoryName?: string;
      setSelectedCategoryName: (c: string | undefined) => void;
      setSelectedTab: (tab: string | undefined) => void;
    }
  | undefined
>(undefined);

/**
 * Project Details page
 */
function ProjectDetailsContent({ project }: { project: ProjectDefinition }) {
  const { t } = useTranslation();
  const registeredTabs = useTypedSelector(state => state.projects.detailsTabs);
  const customDeleteButton = useTypedSelector(state => state.projects.projectDeleteButton);
  const registeredHeaderActions = useTypedSelector(state => state.projects.headerActions);

  const [DeleteButton, setDeleteButton] = useState<
    (p: { project: ProjectDefinition; buttonStyle?: ButtonStyle }) => ReactNode
  >(() => ProjectDeleteButton);

  const [headerActions, setHeaderActions] = useState<ReactNode[]>([]);

  // Load custom delete button
  useEffect(() => {
    if (!customDeleteButton) return;

    let isCurrent = true;

    if (customDeleteButton.isEnabled) {
      customDeleteButton
        .isEnabled({ project })
        .then(isEnabled => {
          if (isEnabled && isCurrent) {
            setDeleteButton(() => customDeleteButton.component);
          }
        })
        .catch(e => {
          console.log(`Failed to check if custom delete button is ready`, e);
        });
    } else {
      setDeleteButton(() => customDeleteButton.component);
    }

    return () => {
      isCurrent = false;
    };
  }, [customDeleteButton, project]);

  // Load custom header actions
  useEffect(() => {
    let isCurrent = true;

    async function loadHeaderActions() {
      const actionsList = Object.values(registeredHeaderActions);

      // Get a list of enabled header actions
      const enabledActions = (
        await Promise.all(
          actionsList.map(action =>
            action.isEnabled
              ? action
                  .isEnabled({ project })
                  .then(isEnabled => (isEnabled ? action : undefined))
                  .catch(e => {
                    console.error('Failed to check if header action is enabled', action, e);
                    return undefined;
                  })
              : Promise.resolve(action)
          )
        )
      ).filter(Boolean);

      if (isCurrent) {
        const actions = enabledActions
          .map(action => (action ? <action.component key={action.id} project={project} /> : null))
          .filter(Boolean);
        setHeaderActions(actions);
      }
    }

    loadHeaderActions();

    return () => {
      isCurrent = false;
    };
  }, [registeredHeaderActions, project]);

  const [selectedTab, setSelectedTab] = useState<string>();
  const [selectedCategoryName, setSelectedCategoryName] = React.useState<string>();

  const { items, isLoading } = useProjectItems(project);

  const [allTabs, setAllTabs] = useState<Record<string, ProjectDetailsTab>>(DEFAULT_TABS);

  useEffect(() => {
    async function loadTabs() {
      const registeredTabsList = Object.values(registeredTabs);
      // Get a list of enabled Tabs
      const enabledTabs = (
        await Promise.all(
          registeredTabsList.map(tab =>
            tab.isEnabled
              ? // if tab provides isEnabled function we call it
                tab
                  .isEnabled({ project })
                  .then(isEnabled => (isEnabled ? tab : undefined))
                  .catch(e => {
                    // if isEnabled check failed then we don't show it
                    console.error('Failed to check if tab is enabled', tab, e);
                    return undefined;
                  })
              : // if no isEnabled function then it's enabled by default
                Promise.resolve(tab)
          )
        )
      ).filter(Boolean) as ProjectDetailsTab[];

      const enabledTabsById = Object.fromEntries(enabledTabs.map(tab => [tab.id, tab]));

      // Merge default tabs with custom tabs
      const allTabs: Record<string, ProjectDetailsTab> = {
        ...DEFAULT_TABS,
        ...enabledTabsById,
      };

      setAllTabs(allTabs);
    }

    loadTabs();
  }, [registeredTabs, project]);

  // Set initial selected tab to the first available tab
  const tabIds = Object.keys(allTabs);
  if (tabIds.length > 0 && !selectedTab) {
    setSelectedTab(tabIds[0]);
  }

  // Get the definition for the currently selected tab
  const selectedTabData = selectedTab ? allTabs[selectedTab] : undefined;

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    setSelectedTab(newValue);
  };

  const contextValue = useMemo(
    () => ({
      setSelectedCategoryName,
      selectedCategoryName,
      setSelectedTab,
    }),
    [setSelectedCategoryName, selectedCategoryName, setSelectedTab]
  );

  if (isLoading) {
    return <Loader title={t('Loading')} />;
  }

  return (
    <ProjectDetailsContext.Provider value={contextValue}>
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

              {headerActions}
              <DeleteButton project={project} />
            </Box>
          }
        >
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={selectedTab} onChange={handleTabChange}>
              {Object.values(allTabs)
                .filter(tab => tab.component)
                .map(tab => (
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
          {/* Render tab content */}
          {selectedTabData && selectedTabData.component ? (
            <selectedTabData.component
              key={selectedTabData.id}
              project={project}
              projectResources={items}
            />
          ) : null}
        </SectionBox>
      </Box>
    </ProjectDetailsContext.Provider>
  );
}

/** Map tab for the Project Details */
function ProjectGraph({ project: { namespaces, clusters } }: { project: ProjectDefinition }) {
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
