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
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { useTypedSelector } from '../../redux/hooks';
import { StatusLabel } from '../common';
import Link from '../common/Link';
import Table, { TableColumn } from '../common/Table/Table';
import { NewProjectPopup } from './NewProjectPopup';
import { getHealthIcon, getProjectResources, getResourcesHealth } from './projectUtils';
import { useProjectResources } from './useProjectResources';

interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  resourceCount: number;
  namespaces: string[];
  labelSelectors: string[];
  resources: KubeObject[];
  clusters: string[];
}

export default function ProjectList() {
  const { t } = useTranslation();
  const projectsState = useTypedSelector(state => state.projects.projects);
  const projects = Object.values(projectsState);
  const [showCreate, setShowCreate] = useState(false);

  const { items } = useProjectResources(projects);

  const projectSummaries = useMemo((): ProjectSummary[] => {
    return projects.map(project => {
      const projectResources = getProjectResources(project, items);
      const namespaces = Array.from(
        new Set(projectResources.map(r => r.getNamespace()).filter(Boolean) as string[])
      );
      const labelSelectors = Object.entries(project.labelSelectors).map(
        ([key, sel]) => `${key} ${sel.operator} ${sel.value || ''}`
      );

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        icon: project.icon,
        resourceCount: projectResources.length,
        resources: projectResources,
        namespaces,
        labelSelectors,
        clusters: project.clusterSelectors.map(it => it.value!),
      };
    });
  }, [projects, items]);

  const handleCreateProject = () => {
    setShowCreate(true);
  };

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

  const columns = useMemo(() => {
    const columns: TableColumn<ProjectSummary, any>[] = [
      {
        id: 'name',
        header: t('Name'),
        accessorFn: it => it.name,
        Cell: ({ row: { original } }) => (
          <>
            {original.icon && (
              <Icon
                icon={original.icon}
                width={24}
                height={24}
                style={{ color: original.color ?? '#1976d2', marginRight: '8px' }}
              />
            )}
            <Link routeName="projectDetails" params={{ projectId: original.id }}>
              {original.name}
            </Link>
          </>
        ),
      },
      {
        id: 'resources',
        header: t('Resources'),
        accessorFn: it => it.resourceCount,
        gridTemplate: 'min-content',
      },
      {
        id: 'health',
        header: t('Health'),
        accessorFn: it => getResourcesHealth(it.resources),
        Cell: ({ row: { original } }) => {
          const projectHealth = getResourcesHealth(original.resources);
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
              {original.resources.length === 0
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
        accessorFn: it => it.namespaces,
      },
      {
        id: 'labels',
        header: t('Label Selectors'),
        accessorFn: it => it.labelSelectors.join(', '),
      },
    ];

    return columns;
  }, []);

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

      <Table columns={columns} data={projectSummaries} />
    </>
  );
}
