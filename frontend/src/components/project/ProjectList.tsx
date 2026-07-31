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
import { Box, Button, Typography } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { useTypedSelector } from '../../redux/hooks';
import type { ProjectDefinition } from '../../redux/projectsSlice';
import { StatusLabel } from '../common';
import Link from '../common/Link';
import Table, { TableColumn } from '../common/Table/Table';
import { NewProjectPopup } from './NewProjectPopup';
import { findProject, groupNamespacesIntoProjects, projectLinkSearch } from './projectGrouping';
import { getHealthIcon, getResourcesHealth, PROJECT_ID_LABEL } from './projectUtils';
import { useProjectItems } from './useProjectResources';

export { groupNamespacesIntoProjects } from './projectGrouping';

const useProjects = (): ProjectDefinition[] => {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf ?? {});
  const projectGrouping = useTypedSelector(state => state.projects.projectGrouping);

  const { items: namespaces } = Namespace.useList({
    clusters: clusters.map(c => c.name),
    labelSelector: PROJECT_ID_LABEL,
  });

  return useMemo(
    () => groupNamespacesIntoProjects(namespaces ?? [], projectGrouping),
    [namespaces, projectGrouping]
  );
};

export const useProject = (name: string) => {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf ?? {});
  const location = useLocation();
  const projectGrouping = useTypedSelector(state => state.projects.projectGrouping);
  const projectKey = useMemo(
    () => new URLSearchParams(location.search).get('projectKey'),
    [location.search]
  );

  const { items: namespaces, isLoading } = Namespace.useList({
    clusters: clusters.map(c => c.name),
    labelSelector: PROJECT_ID_LABEL + '=' + name,
  });

  return useMemo(
    () => ({
      isLoading,
      project: namespaces
        ? findProject(groupNamespacesIntoProjects(namespaces, projectGrouping), name, projectKey)
        : undefined,
    }),
    [isLoading, name, namespaces, projectGrouping, projectKey]
  );
};

export default function ProjectList() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const pluginApiResources = useTypedSelector(state => state.projects.apiResources);

  const projects = useProjects();
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.PROJECT_LIST_VIEW);

  useEffect(() => {
    dispatchHeadlampEvent({ projects });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const handleCreateProject = () => {
    setShowCreate(true);
  };

  const columns = useMemo(() => {
    const columns: TableColumn<ProjectDefinition, any>[] = [
      {
        id: 'name',
        header: t('Name'),
        accessorFn: it => it.id,
        Cell: ({ row: { original } }) => (
          <Link
            routeName="projectDetails"
            params={{ name: original.id }}
            search={projectLinkSearch(original)}
          >
            {original.id}
          </Link>
        ),
      },
      {
        id: 'resources',
        header: t('Resources'),
        Cell: ({ row: { original } }) => {
          const { items } = useProjectItems(original, { disableWatch: true });
          return items.length;
        },
        gridTemplate: 'min-content',
      },
      {
        id: 'health',
        header: t('Health'),
        Cell: ({ row: { original } }) => {
          const { items } = useProjectItems(original, { disableWatch: true });
          const projectHealth = getResourcesHealth(items);
          return (
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
              {items.length === 0
                ? t('No Resources')
                : projectHealth.error > 0
                ? t('Unhealthy')
                : projectHealth.warning > 0
                ? t('Degraded')
                : t('Healthy')}
            </StatusLabel>
          );
        },
        gridTemplate: 'min-content',
      },
      {
        id: 'clusters',
        header: t('Clusters'),
        accessorFn: it => it.clusters.join(', '),
      },
      {
        id: 'namespaces',
        header: t('Namespaces'),
        accessorFn: it => it.namespaces.join(', '),
      },
    ];

    return columns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (projects.length === 0) {
    return (
      <>
        {showCreate && <NewProjectPopup open={showCreate} onClose={() => setShowCreate(false)} />}
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="400px"
          textAlign="center"
        >
          <Icon
            icon="mdi:folder-multiple"
            style={{ fontSize: 64, color: '#ccc', marginBottom: 16 }}
          />
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
      </>
    );
  }

  return (
    <>
      {showCreate && <NewProjectPopup open={showCreate} onClose={() => setShowCreate(false)} />}
      <Box display="flex" justifyContent="flex-end" mb={2} mt={2}>
        <Button
          variant="contained"
          startIcon={<Icon icon="mdi:plus" />}
          onClick={handleCreateProject}
        >
          {t('Create Project')}
        </Button>
      </Box>

      <Table key={pluginApiResources.length} columns={columns} data={projects} />
    </>
  );
}
