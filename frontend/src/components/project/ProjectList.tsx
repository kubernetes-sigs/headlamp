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
import { groupBy, uniq } from 'lodash';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClustersConf } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { ProjectDefinition } from '../../redux/projectsSlice';
import { StatusLabel } from '../common';
import Link from '../common/Link';
import Table, { TableColumn } from '../common/Table/Table';
import { NewProjectPopup } from './NewProjectPopup';
import { getHealthIcon, getResourcesHealth, PROJECT_ID_LABEL } from './projectUtils';
import { useProjectItems } from './useProjectResources';

const useProjects = (): ProjectDefinition[] => {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf ?? {});

  const { items: namespaces } = Namespace.useList({
    clusters: clusters.map(c => c.name),
    labelSelector: PROJECT_ID_LABEL,
  });

  const projects = useMemo(
    () =>
      Object.entries(groupBy(namespaces, n => n.metadata.labels![PROJECT_ID_LABEL])).map(
        ([name, namespaces]) => ({
          id: name,
          namespaces: uniq(namespaces.map(it => it.metadata.name)),
          clusters: uniq(namespaces.map(it => it.cluster)),
        })
      ),
    [namespaces]
  );

  return projects;
};

export const useProject = (name: string) => {
  const clusterConf = useClustersConf();
  const clusters = Object.values(clusterConf ?? {});

  const { items: namespaces, isLoading } = Namespace.useList({
    clusters: clusters.map(c => c.name),
    labelSelector: PROJECT_ID_LABEL + '=' + name,
  });

  return useMemo(
    () => ({
      isLoading,
      project: namespaces
        ? ({
            clusters: uniq(namespaces.map(it => it.cluster)),
            namespaces: uniq(namespaces.map(it => it.metadata.name)),
            id: name,
          } as ProjectDefinition)
        : undefined,
    }),
    [namespaces, name, isLoading]
  );
};

export default function ProjectList() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);

  const projects = useProjects();

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
          <>
            <Link routeName="projectDetails" params={{ name: original.id }}>
              {original.id}
            </Link>
          </>
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

      <Table columns={columns} data={projects} />
    </>
  );
}
