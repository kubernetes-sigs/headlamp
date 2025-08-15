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
  Chip,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useParams } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import {
  createProject,
  ProjectClusterSelector,
  ProjectLabelSelector,
  ProjectNamespaceSelector,
  updateProject,
} from '../../redux/projectsSlice';
import SectionBox from '../common/SectionBox';

interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  labelSelectors: ProjectLabelSelector[];
  namespaceSelectors: ProjectNamespaceSelector[];
  clusterSelectors: ProjectClusterSelector[];
}

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

  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    color: DEFAULT_COLORS[0],
    icon: 'mdi:application',
    labelSelectors: [],
    namespaceSelectors: [],
    clusterSelectors: [],
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [newClusterName, setNewClusterName] = useState<string>('');
  const [newNamespaceName, setNewNamespaceName] = useState<string>('');
  const [newLabelKey, setNewLabelKey] = useState<string>('');
  const [newLabelValue, setNewLabelValue] = useState<string>('');
  const [newLabelOperator, setNewLabelOperator] = useState<string>('Equals');
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(null);
  const [iconPopoverAnchor, setIconPopoverAnchor] = useState<HTMLElement | null>(null);
  const [customColor, setCustomColor] = useState<string>('');

  // Convert project name to Kubernetes-compatible format
  const toKubernetesName = (name: string): string => {
    const converted = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric chars with dashes
      .replace(/-+/g, '-') // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .substring(0, 63); // Ensure max 63 characters for DNS-1123 compliance

    // Validate using existing Kubernetes validation
    return Namespace.isValidNamespaceFormat(converted) ? converted : '';
  };

  // Validate hex color format
  const isValidHexColor = (color: string): boolean => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  };

  // Handle custom color input
  const handleCustomColorChange = (value: string) => {
    setCustomColor(value);
    if (isValidHexColor(value)) {
      setFormData(prev => ({ ...prev, color: value }));
    }
  };

  // Auto-generate default label selector when project name changes
  useEffect(() => {
    if (formData.name.trim() && !isEdit) {
      const kubernetesName = toKubernetesName(formData.name);
      if (kubernetesName) {
        setFormData(prev => {
          // Check if we already have an app.kubernetes.io/name label
          const existingIndex = prev.labelSelectors.findIndex(
            selector => selector.key === 'app.kubernetes.io/name' && selector.operator === 'Equals'
          );

          const newSelector = {
            key: 'app.kubernetes.io/name',
            value: kubernetesName,
            operator: 'Equals' as const,
          };

          let newLabelSelectors;
          if (existingIndex >= 0) {
            // Update existing selector
            newLabelSelectors = prev.labelSelectors.map((selector, i) =>
              i === existingIndex ? newSelector : selector
            );
          } else {
            // Add new selector at the beginning
            newLabelSelectors = [newSelector, ...prev.labelSelectors];
          }

          return {
            ...prev,
            labelSelectors: newLabelSelectors,
          };
        });
      }
    }
  }, [formData.name, isEdit]);

  // Fetch namespaces from all clusters
  const [namespacesList] = Namespace.useList({
    clusters: formData.clusterSelectors.map(sel => sel.name),
  });
  const availableNamespaces = React.useMemo(() => {
    if (!namespacesList) return [];
    return namespacesList
      .map(ns => ns.metadata.name)
      .filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
      .sort((a, b) => a.localeCompare(b));
  }, [namespacesList]);

  useEffect(() => {
    if (existingProject) {
      setFormData({
        name: existingProject.name,
        description: existingProject.description || '',
        color: existingProject.color || '#1976d2',
        icon: existingProject.icon || 'mdi:application',
        labelSelectors:
          existingProject.labelSelectors.length > 0 ? existingProject.labelSelectors : [],
        namespaceSelectors: existingProject.namespaceSelectors || [],
        clusterSelectors: existingProject.clusterSelectors || [],
      });
    }
  }, [existingProject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) {
      newErrors.name = t('Project name is required');
    }

    if (formData.labelSelectors.length === 0 && formData.namespaceSelectors.length === 0) {
      newErrors.labelSelectors = t('At least one label selector or namespace selector is required');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const projectData = {
      name: formData.name,
      description: formData.description,
      color: formData.color,
      icon: formData.icon,
      labelSelectors: formData.labelSelectors.filter(selector => selector.key.trim()),
      namespaceSelectors: formData.namespaceSelectors.filter(selector => selector.name.trim()),
      clusterSelectors: formData.clusterSelectors.filter(selector => selector.name.trim()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isEdit && existingProject) {
      dispatch(
        updateProject({
          id: existingProject.id,
          ...projectData,
        })
      );
    } else {
      dispatch(createProject(projectData));
    }

    // Navigate back to projects list
    history.push(createRouteURL('projects'));
  };

  const handleCancel = () => {
    history.push(createRouteURL('projects'));
  };

  const addLabelSelector = () => {
    if (!newLabelKey.trim()) return;

    const labelSelector = {
      key: newLabelKey.trim(),
      value: newLabelValue.trim(),
      operator: newLabelOperator as any,
    };

    setFormData(prev => {
      let newLabelSelectors;
      if (editingLabelIndex !== null) {
        // Update existing label
        newLabelSelectors = prev.labelSelectors.map((selector, i) =>
          i === editingLabelIndex ? labelSelector : selector
        );
      } else {
        // Add new label, avoid duplicates
        const existingIndex = prev.labelSelectors.findIndex(
          selector =>
            selector.key === labelSelector.key && selector.operator === labelSelector.operator
        );
        if (existingIndex >= 0) {
          // Update existing
          newLabelSelectors = prev.labelSelectors.map((selector, i) =>
            i === existingIndex ? labelSelector : selector
          );
        } else {
          // Add new
          newLabelSelectors = [...prev.labelSelectors, labelSelector];
        }
      }
      return {
        ...prev,
        labelSelectors: newLabelSelectors,
      };
    });

    // Reset form
    setNewLabelKey('');
    setNewLabelValue('');
    setNewLabelOperator('Equals');
    setEditingLabelIndex(null);
  };

  const removeLabelSelector = (index: number) => {
    setFormData(prev => ({
      ...prev,
      labelSelectors: prev.labelSelectors.filter((_, i) => i !== index),
    }));
  };

  const editLabelSelector = (index: number) => {
    const selector = formData.labelSelectors[index];
    setNewLabelKey(selector.key);
    setNewLabelValue(selector.value || '');
    setNewLabelOperator(selector.operator);
    setEditingLabelIndex(index);
  };

  const cancelLabelEdit = () => {
    setNewLabelKey('');
    setNewLabelValue('');
    setNewLabelOperator('Equals');
    setEditingLabelIndex(null);
  };

  const addNamespaceSelector = (namespaceName: string) => {
    if (!namespaceName.trim()) return;

    setFormData(prev => {
      const newNamespaceSelectors = [...prev.namespaceSelectors];
      // Avoid duplicates
      if (!newNamespaceSelectors.find(selector => selector.name === namespaceName)) {
        newNamespaceSelectors.push({ name: namespaceName });
      }
      return {
        ...prev,
        namespaceSelectors: newNamespaceSelectors,
      };
    });
    setNewNamespaceName('');
  };

  const removeNamespaceSelector = (namespaceName: string) => {
    setFormData(prev => ({
      ...prev,
      namespaceSelectors: prev.namespaceSelectors.filter(
        selector => selector.name !== namespaceName
      ),
    }));
  };

  const addClusterSelector = (clusterName: string) => {
    if (!clusterName.trim()) return;

    setFormData(prev => {
      const newClusterSelectors = [...prev.clusterSelectors];
      // Avoid duplicates
      if (!newClusterSelectors.find(selector => selector.name === clusterName)) {
        newClusterSelectors.push({ name: clusterName });
      }
      return {
        ...prev,
        clusterSelectors: newClusterSelectors,
      };
    });
    setNewClusterName('');
  };

  const removeClusterSelector = (clusterName: string) => {
    setFormData(prev => ({
      ...prev,
      clusterSelectors: prev.clusterSelectors.filter(selector => selector.name !== clusterName),
    }));
  };

  return (
    <SectionBox title={isEdit ? t('Edit Project') : t('Create Project')}>
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                {t('Basic Information')}
              </Typography>
            </Grid>

            <Grid item container spacing={2} xs={12} md={6}>
              <Grid item container spacing={1} xs={12} md={6}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label={t('Project Name')}
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    error={!!errors.name}
                    helperText={errors.name}
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label={t('Description')}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={2}
                  />
                </Grid>
              </Grid>

              <Grid item xs={6}>
                <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                  {/* Icon Selector */}
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('Icon')}
                    </Typography>
                    <Box
                      onClick={e => setIconPopoverAnchor(e.currentTarget)}
                      sx={{
                        width: 64,
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid',
                        borderColor: 'grey.300',
                        borderRadius: 1,
                        cursor: 'pointer',
                        backgroundColor: 'grey.50',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                          borderColor: 'primary.main',
                          backgroundColor: 'primary.light',
                        },
                      }}
                    >
                      <Icon
                        icon={formData.icon}
                        width={32}
                        height={32}
                        style={{ color: formData.color }}
                      />
                    </Box>
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
                                setFormData(prev => ({ ...prev, icon }));
                                setIconPopoverAnchor(null);
                              }}
                              sx={{
                                width: 48,
                                height: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid',
                                borderColor: formData.icon === icon ? 'primary.main' : 'grey.300',
                                borderRadius: 1,
                                cursor: 'pointer',
                                backgroundColor:
                                  formData.icon === icon ? 'primary.light' : 'transparent',
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
                                style={{ color: formData.color }}
                              />
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </Popover>
                  </Box>

                  {/* Color Selector */}
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
                            setFormData(prev => ({ ...prev, color }));
                            setCustomColor('');
                          }}
                          sx={{
                            width: 32,
                            height: 32,
                            backgroundColor: color,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            border: '3px solid',
                            borderColor: formData.color === color ? 'text.primary' : 'transparent',
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
              </Grid>
            </Grid>

            {/* Label Selectors */}

            {/* Cluster Selectors */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                {t('Cluster Selectors')}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t(
                  'Limit this project to specific clusters (optional). If no clusters are selected, all clusters will be included.'
                )}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                options={
                  allClusters
                    ? Object.keys(allClusters).filter(
                        cluster =>
                          !formData.clusterSelectors.find(selector => selector.name === cluster)
                      )
                    : []
                }
                value={newClusterName}
                onChange={(event, newValue) => {
                  if (newValue) {
                    addClusterSelector(newValue);
                  }
                }}
                inputValue={newClusterName}
                onInputChange={(event, newInputValue) => {
                  setNewClusterName(newInputValue);
                }}
                renderInput={params => (
                  <TextField
                    {...params}
                    label={t('Add Cluster')}
                    placeholder={t('Select a cluster')}
                    variant="outlined"
                    size="small"
                    helperText={t('Select clusters to include in this project')}
                    sx={{ maxWidth: 400 }}
                  />
                )}
                noOptionsText={t('No available clusters')}
                disabled={!allClusters || Object.keys(allClusters).length === 0}
              />

              {formData.clusterSelectors.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    mt: 2,
                  }}
                >
                  {formData.clusterSelectors.map(selector => (
                    <Chip
                      key={selector.name}
                      label={selector.name}
                      color="secondary"
                      onDelete={() => removeClusterSelector(selector.name)}
                    />
                  ))}
                </Box>
              )}
            </Grid>

            {/* Namespace Selectors */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                {t('Namespace Selectors')}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('Limit this project to specific namespaces (optional)')}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                freeSolo
                options={availableNamespaces.filter(
                  ns => !formData.namespaceSelectors.find(selector => selector.name === ns)
                )}
                value={newNamespaceName}
                onChange={(event, newValue) => {
                  if (newValue) {
                    addNamespaceSelector(newValue);
                  }
                }}
                inputValue={newNamespaceName}
                onInputChange={(event, newInputValue) => {
                  setNewNamespaceName(newInputValue);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && newNamespaceName.trim()) {
                    event.preventDefault();
                    addNamespaceSelector(newNamespaceName);
                  }
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

              {formData.namespaceSelectors.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    mt: 2,
                  }}
                >
                  {formData.namespaceSelectors.map(selector => (
                    <Chip
                      key={selector.name}
                      label={selector.name}
                      color="primary"
                      size="small"
                      onDelete={() => removeNamespaceSelector(selector.name)}
                    />
                  ))}
                </Box>
              )}
            </Grid>

            {/* Label Selectors */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                {t('Label Selectors')}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('Define which resources belong to this project based on their labels')}
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1 }}>
                <TextField
                  label={t('Key')}
                  value={newLabelKey}
                  onChange={e => setNewLabelKey(e.target.value)}
                  placeholder="app.kubernetes.io/name"
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>{t('Operator')}</InputLabel>
                  <Select
                    value={newLabelOperator}
                    onChange={e => setNewLabelOperator(e.target.value)}
                  >
                    {OPERATOR_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label={t('Value')}
                  value={newLabelValue}
                  onChange={e => setNewLabelValue(e.target.value)}
                  disabled={newLabelOperator === 'Exists' || newLabelOperator === 'NotExists'}
                  size="small"
                  sx={{ minWidth: 150 }}
                />
                <Button
                  onClick={addLabelSelector}
                  variant="contained"
                  size="small"
                  startIcon={<Icon icon={editingLabelIndex !== null ? 'mdi:check' : 'mdi:plus'} />}
                  disabled={!newLabelKey.trim()}
                >
                  {editingLabelIndex !== null ? t('Update') : t('Add')}
                </Button>
                {editingLabelIndex !== null && (
                  <Button onClick={cancelLabelEdit} variant="outlined" size="small">
                    {t('Cancel')}
                  </Button>
                )}
              </Box>

              {formData.labelSelectors.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    mt: 1,
                  }}
                >
                  {formData.labelSelectors.map((selector, index) => (
                    <Chip
                      key={`${selector.key}-${selector.operator}-${index}`}
                      label={
                        selector.operator === 'Exists' || selector.operator === 'NotExists'
                          ? `${selector.key} ${selector.operator}`
                          : `${selector.key} ${selector.operator} ${selector.value}`
                      }
                      color="primary"
                      variant="outlined"
                      onDelete={() => removeLabelSelector(index)}
                      onClick={() => editLabelSelector(index)}
                      deleteIcon={<Icon icon="mdi:delete" />}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              )}
            </Grid>

            {/* Form Actions */}
            <Grid item xs={12}>
              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button onClick={handleCancel} variant="outlined">
                  {t('Cancel')}
                </Button>
                <Button type="submit" variant="contained">
                  {isEdit ? t('Update Project') : t('Create Project')}
                </Button>
              </Box>
            </Grid>
          </Grid>

          {errors.labelSelectors && (
            <FormHelperText error sx={{ mt: 2 }}>
              {errors.labelSelectors}
            </FormHelperText>
          )}
        </form>
      </Paper>
    </SectionBox>
  );
}
