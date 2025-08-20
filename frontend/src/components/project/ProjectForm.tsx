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
  Alert,
  Autocomplete,
  Box,
  Button,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Popover,
  Step,
  StepButton,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useParams } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import { apiResourceId, parseFromId } from '../../lib/k8s/api/v2/ApiResource';
import Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { createOrUpdateProjectAction, ProjectDefinition } from '../../redux/projectsSlice';
import { ApiResourcesView } from '../advancedSearch/ApiResourcePicker';
import { ClusterGroupErrorMessage } from '../cluster/ClusterGroupErrorMessage';
import { ProjectResourcesTab } from './ProjectResourcesTab';
import { defaultApiResources, getProjectResources } from './projectUtils';
import { useLabelSuggestions } from './useLabelSuggestions';
import { useProjectResources } from './useProjectResources';

interface ProjectFormParams {
  projectId?: string;
}

const DEFAULT_ICONS = [
  'mdi:application',
  'mdi:folder-multiple',
  'mdi:hexagon-multiple',
  'mdi:cube',
  'mdi:layers',
  'mdi:server',
  'mdi:database',
  'mdi:web',
  'mdi:api',
  'mdi:cog',
];

const DEFAULT_COLORS = [
  '#424242', // Grey
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#d32f2f', // Red
  '#7b1fa2', // Purple
  '#0288d1', // Light Blue
  '#00796b', // Teal
  '#455a64', // Blue Grey
  '#f9a825', // Amber
  '#e91e63', // Pink
  '#795548', // Brown
];

const OPERATOR_OPTIONS = [
  { value: 'Equals', label: 'Equals' },
  { value: 'NotEquals', label: 'Not Equals' },
  { value: 'Exists', label: 'Exists' },
  { value: 'NotExists', label: 'Not Exists' },
];

const STEPS = {
  INFO: 0,
  CLUSTERS: 1,
  LABELS: 2,
  RESOURCES: 3,
};

export default function ProjectForm() {
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useDispatch();
  const { projectId } = useParams<ProjectFormParams>();

  const projectsState = useTypedSelector(state => state.projects.projects);
  const allClusters = useClustersConf();
  const projects = Object.values(projectsState);
  const existingProject = projectId ? projects.find(p => p.id === projectId) : null;
  const isEdit = !!existingProject;

  const [project, setProject] = useState<Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'>>(
    () => {
      const initialProject = existingProject
        ? structuredClone(existingProject)
        : {
            name: '',
            description: '',
            color: DEFAULT_COLORS[0],
            icon: 'mdi:folder-multiple',
            labelSelectors: {},
            namespaceSelectors: [],
            clusterSelectors: [],
            apiResources: defaultApiResources,
          };
      return initialProject;
    }
  );

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [iconPopoverAnchor, setIconPopoverAnchor] = useState<HTMLElement | null>(null);
  const [customColor, setCustomColor] = useState<string>('');

  // Validate hex color format
  const isValidHexColor = (color: string): boolean => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  };

  // Handle custom color input
  const handleCustomColorChange = (value: string) => {
    setCustomColor(value);
    if (isValidHexColor(value)) {
      setProject(prev => ({ ...prev, color: value }));
    }
  };

  // Fetch namespaces from all clusters
  const [namespacesList] = Namespace.useList({
    clusters: project.clusterSelectors.map(sel => sel.value).filter(Boolean) as string[],
  });
  const availableNamespaces = React.useMemo(() => {
    if (!namespacesList) return [];
    return namespacesList
      .map(ns => ns.metadata.name)
      .filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
      .sort((a, b) => a.localeCompare(b));
  }, [namespacesList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const newErrors: { [key: string]: string } = {};
    if (!project.name.trim()) {
      newErrors.name = t('Project name is required');
    }

    if (
      Object.keys(project.labelSelectors).length === 0 &&
      project.namespaceSelectors.length === 0
    ) {
      newErrors.labelSelectors = t('At least one label selector or namespace selector is required');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const id = existingProject?.id ?? `project-${Math.random().toString(36).substring(2, 9)}`;

    const projectData = {
      id: id,
      name: project.name,
      description: project.description,
      color: project.color,
      icon: project.icon,
      labelSelectors: project.labelSelectors,
      namespaceSelectors: project.namespaceSelectors,
      clusterSelectors: project.clusterSelectors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apiResources: project.apiResources,
    };

    dispatch(createOrUpdateProjectAction(projectData));

    // Navigate back to projects list
    history.push(createRouteURL('projectDetails', { projectId: id }));
  };

  const handleCancel = () => {
    history.push(createRouteURL('projects'));
  };

  const addLabelSelector = () => {
    setProject(prev => {
      return {
        ...prev,
        labelSelectors: {
          ...prev.labelSelectors,
          ['']: { value: '', operator: 'Equals' },
        },
      };
    });
  };

  const removeLabelSelector = (key: string) => {
    setProject(prev => {
      const newSelectors = { ...prev.labelSelectors };
      delete newSelectors[key];
      return { ...prev, labelSelectors: newSelectors };
    });
  };

  const handleLabelSelectorChange = (
    key: string,
    field: 'key' | 'value' | 'operator',
    value: string
  ) => {
    setProject(prev => {
      const newSelectors = { ...prev.labelSelectors };

      if (field === 'key') {
        if (key !== value && !newSelectors[value]) {
          newSelectors[value] = newSelectors[key];
          delete newSelectors[key];
        }
      } else {
        newSelectors[key] = { ...newSelectors[key], [field]: value };
      }

      return { ...prev, labelSelectors: newSelectors };
    });
  };

  const { data: apiResources } = useQuery({
    queryFn: () =>
      apiDiscovery(project.clusterSelectors.map(it => it.value).filter(Boolean) as string[]),
    enabled: project.clusterSelectors.length > 0,
    queryKey: ['api-discovery', ...project.clusterSelectors.map(it => it.value)],
  });

  const { suggestions, errors: suggestionErrors } = useLabelSuggestions({
    namespaces: project.namespaceSelectors.map(it => it.value) as string[],
    clusters: project.clusterSelectors.map(it => it.value) as string[],
  });

  const [activeStep, setActiveStep] = useState(0);

  return (
    <Box sx={{ margin: '0 auto', maxWidth: '1400px', p: 3 }}>
      <Typography variant="h1" sx={{ my: 3 }}>
        {isEdit ? t('Edit Project') : t('Create Project')}
      </Typography>

      <Stepper nonLinear activeStep={activeStep} sx={{ mt: 3 }}>
        <Step completed={!!project.name}>
          <StepButton onClick={() => setActiveStep(STEPS.INFO)}>
            <Trans>Basic Information</Trans>
          </StepButton>
        </Step>
        <Step completed={project.clusterSelectors.length > 0}>
          <StepButton onClick={() => setActiveStep(STEPS.CLUSTERS)}>
            <Trans>Clusters</Trans>
          </StepButton>
        </Step>
        <Step
          completed={
            !!Object.keys(project.labelSelectors).length || !!project.namespaceSelectors.length
          }
        >
          <StepButton onClick={() => setActiveStep(STEPS.LABELS)}>
            <Trans>Namespaces and Labels</Trans>
          </StepButton>
        </Step>
        <Step completed={project.clusterSelectors.length > 0 && project.apiResources.length > 0}>
          <StepButton onClick={() => setActiveStep(STEPS.RESOURCES)}>
            <Trans>Resources</Trans>
          </StepButton>
        </Step>
      </Stepper>
      <Box sx={{ mt: 6 }}></Box>
      <form onSubmit={handleSubmit}>
        <Grid container spacing={4}>
          {/* Basic Information */}
          {activeStep === STEPS.INFO && (
            <>
              <Grid item xs={3}>
                <Typography variant="body1">{t('Basic Information')}</Typography>
              </Grid>

              <Grid item container spacing={2} xs={12} md={9}>
                <Grid item container spacing={2} xs={12} md={6}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label={t('Project Name')}
                      value={project.name}
                      onChange={e => setProject(prev => ({ ...prev, name: e.target.value }))}
                      error={!!errors.name}
                      helperText={errors.name}
                      variant="outlined"
                      size="small"
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label={t('Description')}
                      value={project.description}
                      onChange={e => setProject(prev => ({ ...prev, description: e.target.value }))}
                      multiline
                      variant="outlined"
                      rows={2}
                    />
                  </Grid>
                </Grid>

                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Icon')}
                    </Typography>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={e => setIconPopoverAnchor(e.currentTarget)}
                    >
                      <Icon
                        icon={project.icon as string}
                        width={32}
                        height={32}
                        style={{ color: project.color }}
                      />
                    </Button>
                    <Popover
                      open={Boolean(iconPopoverAnchor)}
                      anchorEl={iconPopoverAnchor}
                      onClose={() => setIconPopoverAnchor(null)}
                      anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'left',
                      }}
                      transformOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                      }}
                    >
                      <Box sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('Select Icon')}
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: 1,
                            maxWidth: 300,
                          }}
                        >
                          {DEFAULT_ICONS.map(icon => (
                            <Box
                              key={icon}
                              onClick={() => {
                                setProject(prev => ({ ...prev, icon }));
                                // setIconPopoverAnchor(null);
                              }}
                              sx={{
                                width: 48,
                                height: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid',
                                borderColor: project.icon === icon ? 'primary.main' : 'grey.300',
                                borderRadius: 1,
                                cursor: 'pointer',
                                backgroundColor:
                                  project.icon === icon ? 'primary.light' : 'transparent',
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  backgroundColor: 'primary.light',
                                },
                              }}
                            >
                              <Icon
                                icon={icon}
                                width={24}
                                height={24}
                                style={{ color: project.color }}
                              />
                            </Box>
                          ))}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            {t('Color')}
                          </Typography>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(6, 1fr)',
                              gap: 1,
                              maxWidth: 240,
                              mb: 2,
                            }}
                          >
                            {DEFAULT_COLORS.map(color => (
                              <Box
                                key={color}
                                onClick={() => {
                                  setProject(prev => ({ ...prev, color }));
                                  setCustomColor('');
                                }}
                                sx={{
                                  width: 32,
                                  height: 32,
                                  backgroundColor: color,
                                  borderRadius: '50%',
                                  cursor: 'pointer',
                                  border: '3px solid',
                                  borderColor:
                                    project.color === color ? 'text.primary' : 'transparent',
                                  transition: 'all 0.2s ease-in-out',
                                  '&:hover': {
                                    transform: 'scale(1.1)',
                                    borderColor: 'text.secondary',
                                  },
                                }}
                              />
                            ))}
                          </Box>
                          <TextField
                            variant="outlined"
                            label={t('Custom Hex Color')}
                            value={customColor}
                            onChange={e => handleCustomColorChange(e.target.value)}
                            placeholder="#1976d2"
                            size="small"
                            sx={{ maxWidth: 200 }}
                            error={customColor !== '' && !isValidHexColor(customColor)}
                            helperText={
                              customColor !== '' && !isValidHexColor(customColor)
                                ? t('Invalid hex color format')
                                : t('Enter a hex color (e.g., #1976d2)')
                            }
                          />
                        </Box>
                      </Box>
                    </Popover>
                  </Box>
                </Grid>
              </Grid>
            </>
          )}

          {activeStep === STEPS.CLUSTERS && (
            <>
              <Grid item xs={3}>
                <Typography variant="body1" gutterBottom>
                  {t('Clusters')}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t(
                    'Limit this project to specific clusters (optional). If no clusters are selected, all clusters will be included.'
                  )}
                </Typography>
              </Grid>

              <Grid item xs={9}>
                <Autocomplete
                  multiple
                  options={
                    allClusters
                      ? Object.keys(allClusters).filter(
                          cluster =>
                            !project.clusterSelectors.find(selector => selector.value === cluster)
                        )
                      : []
                  }
                  value={project.clusterSelectors.map(it => it.value)}
                  onChange={(e, newValue) => {
                    setProject(project => ({
                      ...project,
                      clusterSelectors: newValue.map(value => ({ value, operator: 'Equals' })),
                    }));
                  }}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label={t('Clusters')}
                      // placeholder={t('Select a cluster')}
                      variant="outlined"
                      size="small"
                      sx={{ maxWidth: 400 }}
                    />
                  )}
                  noOptionsText={t('No available clusters')}
                  disabled={!allClusters || Object.keys(allClusters).length === 0}
                />
              </Grid>
            </>
          )}

          {/* Namespace Selectors */}
          {activeStep === STEPS.LABELS && (
            <>
              <Grid item xs={3}>
                <Typography variant="body1" gutterBottom>
                  {t('Namespaces')}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('Limit this project to specific namespaces (optional)')}
                </Typography>
              </Grid>

              <Grid item xs={9}>
                <Autocomplete
                  multiple
                  freeSolo
                  options={availableNamespaces.filter(
                    ns => !project.namespaceSelectors.find(selector => selector.value === ns)
                  )}
                  value={project.namespaceSelectors.map(it => it.value)}
                  onChange={(event, newValue) => {
                    setProject(project => ({
                      ...project,
                      namespaceSelectors: newValue.map(value => ({ value, operator: 'Equals' })),
                    }));
                  }}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label={t('Add Namespace')}
                      placeholder={t('Type or select a namespace')}
                      variant="outlined"
                      size="small"
                      helperText={t(
                        'Select namespaces to include in this project. You can type custom names if they are not listed.'
                      )}
                      sx={{ maxWidth: 400 }}
                    />
                  )}
                  noOptionsText={t('No available namespaces - you can type a custom name')}
                />
              </Grid>
              <Grid item xs={3}>
                <Typography variant="body1" gutterBottom>
                  {t('Label Selectors')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('Define which resources belong to this project based on their labels')}
                </Typography>
              </Grid>
              <Grid item xs={9}>
                {Object.entries(project.labelSelectors).map(([key, selector], index) => (
                  <Box
                    key={index}
                    sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}
                  >
                    <TextField
                      label={t('Key')}
                      value={key}
                      onChange={e => handleLabelSelectorChange(key, 'key', e.target.value)}
                      placeholder="app.kubernetes.io/name"
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 180 }}
                    />
                    <TextField
                      select
                      variant="outlined"
                      size="small"
                      label={t('Operator')}
                      value={selector.operator}
                      onChange={e => handleLabelSelectorChange(key, 'operator', e.target.value)}
                    >
                      {OPERATOR_OPTIONS.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label={t('Value')}
                      value={selector.value}
                      onChange={e => handleLabelSelectorChange(key, 'value', e.target.value)}
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 150 }}
                    />
                    <Button
                      onClick={() => removeLabelSelector(key)}
                      variant="contained"
                      color="secondary"
                      size="small"
                      title={t('Remove selector')}
                      sx={{
                        alignSelf: 'stretch',
                      }}
                      startIcon={<Icon icon="mdi:close" />}
                    >
                      {t('Delete')}
                    </Button>
                  </Box>
                ))}

                <Button
                  onClick={addLabelSelector}
                  variant="contained"
                  color="secondary"
                  startIcon={<Icon icon="mdi:plus" />}
                  sx={{ marginTop: 2 }}
                >
                  {t('Add Label Selector')}
                </Button>
                {suggestions.length > 0 && (
                  <Box sx={{ maxWidth: '400px', mt: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('We have detected the following labels in your cluster')}
                    </Typography>
                    <List dense sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {suggestions.map(suggestion => (
                        <ListItem>
                          <ListItemButton
                            onClick={() => {
                              setProject(p => ({
                                ...p,
                                labelSelectors: {
                                  ...p.labelSelectors,
                                  [suggestion.label]: {
                                    operator: 'Equals',
                                    value: suggestion.value,
                                  },
                                },
                              }));
                            }}
                          >
                            <ListItemText>
                              {suggestion.label}: {suggestion.value}
                            </ListItemText>
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
                {suggestionErrors.length > 0 && (
                  <ClusterGroupErrorMessage errors={suggestionErrors} />
                )}
              </Grid>
            </>
          )}

          {activeStep === STEPS.RESOURCES &&
            (project.clusterSelectors.length === 0 ? (
              <Alert
                severity="info"
                action={
                  <Button color="inherit" size="small" onClick={() => setActiveStep(1)}>
                    <Trans>Select cluster</Trans>
                  </Button>
                }
                sx={{
                  marginTop: 3,
                  marginX: 'auto',
                }}
              >
                <Trans>You need to select a cluster first</Trans>
              </Alert>
            ) : (
              <>
                <Grid item xs={3}>
                  <Typography variant="body1" gutterBottom>
                    {t('Resources')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {t(
                      'Select which resources to include in the project. For example: Pods, Deployments, etc.'
                    )}
                  </Typography>
                </Grid>

                <Grid item xs={9}>
                  {apiResources && (
                    <ApiResourcesView
                      resources={apiResources}
                      setSelectedResources={resources =>
                        setProject(prev => ({
                          ...prev,
                          apiResources: [...resources].map(it => parseFromId(it)),
                        }))
                      }
                      selectedResources={new Set(project.apiResources.map(it => apiResourceId(it)))}
                    />
                  )}
                </Grid>

                <ProjectResourcesPreview
                  project={project as any}
                  key={
                    project.clusterSelectors.map(it => it.value).join('') +
                    project.apiResources.map(it => it.pluralName).join('')
                  }
                />
              </>
            ))}

          {/* Form Actions */}
          <Grid item xs={12}>
            <Box display="flex" gap={2} justifyContent="flex-end" my={4}>
              <Button
                onClick={handleCancel}
                variant="contained"
                color="secondary"
                sx={{ mr: 'auto' }}
              >
                {t('Cancel')}
              </Button>
              {activeStep > 0 && (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => setActiveStep(i => i - 1)}
                  startIcon={<Icon icon="mdi:chevron-left" />}
                >
                  <Trans>Back</Trans>
                </Button>
              )}
              {activeStep < Object.keys(STEPS).length - 1 && (
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(i => i + 1)}
                  startIcon={<Icon icon="mdi:chevron-right" />}
                >
                  <Trans>Next</Trans>
                </Button>
              )}

              {(activeStep === STEPS.RESOURCES || isEdit) && (
                <Button type="submit" variant="contained">
                  {isEdit ? t('Update Project') : t('Create Project')}
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
          {Object.values(errors).map(error => (
            <Alert severity="error">{error}</Alert>
          ))}
        </Box>
      </form>
    </Box>
  );
}

function ProjectResourcesPreview({ project }: { project: ProjectDefinition }) {
  const { items } = useProjectResources(project);
  const projectResources = useMemo(() => getProjectResources(project, items), [items, project]);

  return (
    <Box sx={{ pl: 3, width: '100%', mt: 3 }}>
      <Typography variant="h5" gutterBottom>
        <Trans>Preview</Trans>
      </Typography>
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          width: '100%',
          maxHeight: '500px',
          display: 'flex',
        }}
      >
        <ProjectResourcesTab
          projectResources={projectResources}
          showClusterColumn={project.clusterSelectors.length > 0}
        />
      </Box>
    </Box>
  );
}
