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
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router';
import { useClustersConf } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { createOrUpdateProjectAction, ProjectDefinition } from '../../redux/projectsSlice';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { defaultApiResources } from './projectUtils';

/**
 * A styled button for selecting a project type.
 */
function ProjectTypeButton({
  icon,
  title,
  description,
  index,
  onClick,
}: {
  index: number;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  onClick?: any;
}) {
  return (
    <Button
      onClick={onClick}
      sx={{
        display: 'flex',
        // flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 2,
        textAlign: 'start',
        border: '1px solid',
        borderColor: 'divider',
        alignItems: 'flex-start',
        padding: 3,
        py: 2,
        animationName: 'reveal',
        animationDuration: '0.25s',
        animationFillMode: 'both',
        animationDelay: 0.1 + index * 0.05 + 's',
        flex: '1',
        '@keyframes reveal': {
          from: {
            opacity: 0,
            transform: 'translateY(10px)',
          },
          to: {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
      }}
    >
      <Box sx={{ width: '52px', height: '52px', alignSelf: 'center' }}>{icon}</Box>
      <Box>
        <Typography variant="h6" sx={{ display: 'flex' }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
    </Button>
  );
}

/**
 * A component for creating a project from an existing Kubernetes namespace.
 * It allows users to select clusters and a namespace to create a project.
 */
function FromNamespace({ onBack }: { onBack: any }) {
  const history = useHistory();
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const allClusters = useClustersConf();
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string | undefined>();

  // Fetch namespaces from all clusters
  const [namespacesList] = Namespace.useList({
    clusters: selectedClusters,
  });
  const availableNamespaces = useMemo(() => {
    if (!namespacesList) return [];
    return namespacesList
      .map(ns => ns.metadata.name)
      .filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
      .sort((a, b) => a.localeCompare(b));
  }, [namespacesList]);

  return (
    <>
      <DialogTitle>{t('Create project from Namespace')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t('For simple projects that have their own namespace')}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 3,
            flexDirection: 'column',
            paddingTop: 2,
            minWidth: '400px',
          }}
        >
          <Autocomplete
            multiple
            options={allClusters ? Object.keys(allClusters) : []}
            value={selectedClusters}
            onChange={(e, newValue) => {
              setSelectedClusters(newValue);
            }}
            renderInput={params => (
              <TextField
                {...params}
                label={t('Clusters')}
                variant="outlined"
                size="small"
                sx={{ maxWidth: 400 }}
              />
            )}
            noOptionsText={t('No available clusters')}
            disabled={!allClusters || Object.keys(allClusters).length === 0}
          />
          <Autocomplete
            freeSolo
            options={availableNamespaces}
            value={selectedNamespace}
            onChange={(event, newValue) => {
              setSelectedNamespace(newValue ?? undefined);
            }}
            renderInput={params => (
              <TextField
                {...params}
                label={t('Namespace')}
                placeholder={t('Type or select a namespace')}
                variant="outlined"
                size="small"
                sx={{ maxWidth: 400 }}
              />
            )}
            noOptionsText={t('No available namespaces - you can type a custom name')}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button
          sx={{ marginRight: 'auto' }}
          startIcon={<Icon icon="mdi:chevron-left" />}
          onClick={onBack}
          variant="contained"
          color="secondary"
        >
          {t('Back')}
        </Button>
        <Button variant="contained" color="secondary">
          {t('Cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={!selectedNamespace}
          onClick={() => {
            if (!selectedNamespace) return;

            const id = `project-${Math.random().toString(36).substring(2, 9)}`;

            const projectData: ProjectDefinition = {
              id: id,
              name: selectedNamespace,
              description: t('Namespace based project'),
              icon: 'mdi:folder',
              labelSelectors: {},
              namespaceSelectors: [
                {
                  operator: 'Equals',
                  value: selectedNamespace,
                },
              ],
              clusterSelectors: selectedClusters.map(it => ({ operator: 'Equals', value: it })),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              apiResources: defaultApiResources,
            };
            dispatch(createOrUpdateProjectAction(projectData));
            history.push(createRouteURL('projectDetails', { projectId: id }));
          }}
        >
          {t('Create')}
        </Button>
      </DialogActions>
    </>
  );
}

/**
 * A dialog for creating a new project.
 * It provides several options for creating a project, such as from a namespace,
 * auto-detection, from YAML, or a custom project.
 */
export function NewProjectPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const history = useHistory();
  const theme = useTheme();
  const { t } = useTranslation();
  const customCreateProject = Object.values(
    useTypedSelector(state => state.projects.customCreateProject)
  );

  const [projectStep, setProjectStep] = useState<
    'namespace' | 'detect' | 'new' | string | undefined
  >();
  const selectedCustomProject = customCreateProject.find(it => it.id === projectStep);

  const handleBack = useCallback(() => {
    setProjectStep(undefined);
  }, []);

  // Keep track of buttons
  let index = 0;

  return (
    <Dialog open={open} maxWidth={false} onClose={onClose}>
      {projectStep === undefined && (
        <>
          <DialogTitle sx={{ display: 'flex' }}>{t('Create a Project')}</DialogTitle>
          <DialogContent sx={{ maxWidth: '540px' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              <Trans>
                Project is a collection of Kubernetes resources. You can use projects to organize
                your resources, for example, by environment, team, or application.
              </Trans>
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Divider sx={{ color: 'text.secondary' }} textAlign="left">
                <Trans>Create new</Trans>
              </Divider>
              <ProjectTypeButton
                index={index++}
                icon={
                  <Icon
                    icon="mdi:folder-add"
                    width="100%"
                    height="100%"
                    color={theme.palette.text.secondary}
                  />
                }
                title={<Trans>New Project from YAML</Trans>}
                description={<Trans>Deploy a new application from YAML</Trans>}
                onClick={() => {
                  onClose();
                  history.push(createRouteURL('projectCreateYaml'));
                }}
              />
              {customCreateProject.map(it => (
                <ProjectTypeButton
                  index={index++}
                  icon={
                    typeof it.icon === 'string' ? (
                      <Icon
                        icon={it.icon}
                        width="100%"
                        height="100%"
                        color={theme.palette.text.secondary}
                      />
                    ) : (
                      <it.icon />
                    )
                  }
                  title={it.name}
                  description={it.description}
                  onClick={() => setProjectStep(it.id)}
                />
              ))}
              <Divider sx={{ color: 'text.secondary' }} textAlign="left">
                <Trans>Organize existing applications</Trans>
              </Divider>

              <ProjectTypeButton
                index={index++}
                icon={<KubeIcon kind="Namespace" />}
                title={<Trans>Namespace Project</Trans>}
                description={<Trans>Create Project from existing Namespace</Trans>}
                onClick={() => setProjectStep('namespace')}
              />
              <ProjectTypeButton
                index={index++}
                icon={
                  <Icon
                    icon="mdi:folder-edit"
                    width="100%"
                    height="100%"
                    color={theme.palette.text.secondary}
                  />
                }
                title={<Trans>Custom Project</Trans>}
                description={<Trans>Define your own project. Offers greatest flexibility</Trans>}
                onClick={() => {
                  history.push(createRouteURL('projectCreate'));
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" color="secondary" onClick={onClose}>
              {t('Cancel')}
            </Button>
          </DialogActions>
        </>
      )}
      {projectStep === 'namespace' && <FromNamespace onBack={handleBack} />}
      {selectedCustomProject && <selectedCustomProject.component onBack={handleBack} />}
    </Dialog>
  );
}
