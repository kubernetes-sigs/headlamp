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
  CircularProgress,
  DialogActions,
  DialogContent,
  FormControl,
  FormControlLabel,
  Grid,
  Input,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { loadAll } from 'js-yaml';
import { Dispatch, FormEvent, SetStateAction, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Redirect, useHistory } from 'react-router';
import { useClustersConf } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { ApiError, apply } from '../../lib/k8s/apiProxy';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router';
import { createOrUpdateProjectAction, ProjectDefinition } from '../../redux/projectsSlice';
import { ViewYaml } from '../advancedSearch/ResourceSearch';
import Table from '../common/Table';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';

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

async function createProjectFromYaml({
  name,
  items,
  k8sName,
  cluster,
  apiResources,
  organizeBy,
  setCreationState,
}: {
  name: string;
  items: KubeObjectInterface[];
  k8sName: string;
  cluster: string;
  apiResources: ApiResource[];
  organizeBy: 'namespace' | 'label';
  setCreationState: Dispatch<SetStateAction<CreationState>>;
}) {
  const itemsToCreate = structuredClone(items);

  if (organizeBy === 'namespace') {
    itemsToCreate.forEach(item => {
      item.metadata.namespace = k8sName;
    });

    const namespace = {
      kind: 'Namespace',
      apiVersion: 'v1',
      metadata: {
        name: k8sName,
      } as any,
    } as any;

    setCreationState({
      stage: 'creating',
      createdResources: [],
      creatingResource: namespace,
    });

    await apply(namespace, cluster);
  } else {
    itemsToCreate.forEach(item => {
      item.metadata.labels ??= {};
      item.metadata.labels['app.kubernetes.io/name'] = k8sName;
    });
  }

  for (const item of itemsToCreate) {
    setCreationState(state => ({
      stage: 'creating',
      createdResources:
        state.stage === 'creating' ? [...state.createdResources, state.creatingResource] : [],
      creatingResource: item,
    }));
    await apply(item, cluster);
  }

  const usedKinds = new Set(itemsToCreate.map(it => it.kind));

  const project: ProjectDefinition = {
    name,
    apiResources: apiResources.filter(it => usedKinds.has(it.kind)),
    createdAt: String(new Date()),
    updatedAt: String(new Date()),
    id: String(Math.random()),
    clusterSelectors: [
      {
        operator: 'Equals',
        value: cluster,
      },
    ],
    labelSelectors:
      organizeBy === 'label'
        ? {
            'app.kubernetes.io/name': {
              operator: 'Equals',
              value: k8sName,
            },
          }
        : {},
    namespaceSelectors:
      organizeBy === 'namespace'
        ? [
            {
              operator: 'Equals',
              value: k8sName,
            },
          ]
        : [],
  };

  setCreationState({
    stage: 'success',
    projectId: project.id,
  });

  return project;
}

type CreationState =
  | { stage: 'form' }
  | {
      stage: 'creating';
      createdResources: KubeObjectInterface[];
      creatingResource: KubeObjectInterface;
    }
  | { stage: 'success'; projectId: string }
  | { stage: 'error'; error: ApiError };

export function CreateNew() {
  const { t } = useTranslation();
  const [items, setItems] = useState<KubeObjectInterface[]>([]);
  const [name, setName] = useState('');
  const allClusters = useClustersConf();
  const [selectedClusters, setSelectedClusters] = useState<string | null>(null);
  const k8sName = toKubernetesName(name);
  const history = useHistory();
  const dispatch = useDispatch();
  const [organizeBy, setOrganizeBy] = useState<'namespace' | 'label'>('namespace');

  const [creationState, setCreationState] = useState<CreationState>({
    stage: 'form',
  });

  const { data: apiResources } = useQuery({
    queryFn: () => apiDiscovery([selectedClusters!]),
    enabled: !!selectedClusters,
    queryKey: ['api-discovery', selectedClusters],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();

    const errors: any = {};
    if (!name.trim()) {
      errors.name = t('Name is required');
    }
    if (!selectedClusters) {
      errors.clusters = t('Cluster is required');
    }
    if (!apiResources) {
      errors.apiResources = t('You have to select at least 1 resource');
    }
    if (items.length === 0) {
      errors.items = t('No resources have been uploaded');
    }

    console.log(errors);
    if (Object.keys(errors).length > 0) {
      setErrors(errors);
      return;
    } else {
      setErrors({});
    }

    try {
      const project = await createProjectFromYaml({
        name,
        items,
        k8sName,
        organizeBy,
        cluster: selectedClusters!,
        apiResources: apiResources!,
        setCreationState,
      });
      dispatch(createOrUpdateProjectAction(project));
      history.push(createRouteURL('projectDetails', { projectId: project.id }));
    } catch (e) {
      setCreationState({
        stage: 'error',
        error: e as ApiError,
      });
    }
  };

  return (
    <>
      <DialogContent>
        {creationState.stage === 'form' && (
          <>
            <form onSubmit={handleCreate}>
              <Typography variant="h1" sx={{ mb: 3 }}>
                {t('Create new Project form YAML')}
              </Typography>
              <Grid container spacing={4}>
                <Grid item xs={3}>
                  <Typography>
                    <Trans>Project name</Trans>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <Trans>Give your project a descriptive name</Trans>
                  </Typography>
                </Grid>
                <Grid item xs={9}>
                  <TextField
                    required
                    label={t('Project Name')}
                    placeholder={t('Enter a name')}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 400 }}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    error={!!errors.name}
                    helperText={errors.name}
                  />
                </Grid>

                <Grid item xs={3}>
                  <Typography>
                    <Trans>Cluster</Trans>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <Trans>Select cluster for this project</Trans>
                  </Typography>
                </Grid>
                <Grid item xs={9}>
                  <Autocomplete
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
                        required
                      />
                    )}
                    noOptionsText={t('No available clusters')}
                    disabled={!allClusters || Object.keys(allClusters).length === 0}
                  />
                </Grid>

                <Grid item xs={3}>
                  <Typography id="organize-label">
                    <Trans>How to organize this project?</Trans>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <Trans>Choose how to organize created resources in this project</Trans>
                  </Typography>
                </Grid>
                <Grid item xs={9}>
                  <FormControl>
                    <RadioGroup
                      aria-labelledby="organize-label"
                      name="organize-choice"
                      row
                      value={organizeBy}
                      onChange={(e, value) => setOrganizeBy(value as any)}
                    >
                      <FormControlLabel
                        value="namespace"
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography>{t('By Namespace')}</Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ width: '300px' }}
                            >
                              <Trans>
                                All resources will be created in{' '}
                                {k8sName ? 'the ' + k8sName : 'a new separate'} namespace
                              </Trans>
                            </Typography>
                          </Box>
                        }
                        sx={theme => ({
                          border: '1px solid',
                          borderColor: 'divider',
                          padding: 1,
                          pl: 0,
                          pr: 2,
                          ml: 0,
                          borderRadius: theme.shape.borderRadius + 'px',
                        })}
                      />
                      <FormControlLabel
                        value="label"
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography>{t('By Label')}</Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ width: '300px' }}
                            >
                              <Trans>
                                Apply app.kubenetes.io/name{k8sName ? '=' + k8sName : ''} label to
                                all resources
                              </Trans>
                            </Typography>
                          </Box>
                        }
                        sx={theme => ({
                          border: '1px solid',
                          borderColor: 'divider',
                          padding: 1,
                          pl: 0,
                          pr: 2,
                          ml: 0,
                          borderRadius: theme.shape.borderRadius + 'px',
                        })}
                      />
                    </RadioGroup>
                  </FormControl>
                </Grid>

                <Grid item xs={3}>
                  <Typography>{t('Upload files(s)')}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('Upload your YAML file(s)')}
                  </Typography>
                </Grid>
                <Grid item xs={9}>
                  {errors.items && <Typography color="error">{errors.items}</Typography>}

                  <Input
                    type="file"
                    error={!!errors.items}
                    sx={theme => ({
                      '::before,::after': {
                        display: 'none',
                      },
                      p: 1,
                      background: theme.palette.background.muted,
                      border: '1px solid',
                      borderColor: theme.palette.divider,
                      borderRadius: theme.shape.borderRadius + 'px',
                      mt: 0,
                    })}
                    inputProps={{
                      accept: '.yaml,.yml,applicaiton/yaml',
                      multiple: true,
                    }}
                    onChange={e => {
                      const fileList = (e.target as HTMLInputElement).files;
                      if (!fileList) return;

                      const promises = Array.from(fileList).map(file => {
                        return new Promise<{ docs: KubeObjectInterface[] }>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const content = reader.result as string;
                            try {
                              const docs = loadAll(content) as KubeObjectInterface[];
                              resolve({ docs });
                            } catch (err) {
                              console.error('Error parsing YAML file:', file.name, err);
                              // Optionally, you can decide how to handle parsing errors.
                              // Here we resolve with an empty array for the failed file.
                              resolve({ docs: [] });
                            }
                          };
                          reader.onerror = err => {
                            console.error('Error reading file:', file.name, err);
                            reject(err);
                          };
                          reader.readAsText(file);
                        });
                      });

                      Promise.all(promises)
                        .then(results => {
                          const newDocs = results.flatMap(result => result.docs);
                          setItems(newDocs);
                          // setYamlDocs(currentDocs => [...currentDocs, ...newDocs]);
                        })
                        .catch(err => {
                          console.error('An error occurred while processing files.', err);
                        });
                    }}
                  />
                </Grid>
              </Grid>

              {items.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
                  <Typography>{t('Items')}</Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      marginTop: items.length > 0 ? '-46px' : 0,
                    }}
                  >
                    <Table
                      data={items}
                      columns={[
                        {
                          id: 'kind',
                          header: t('Kind'),
                          accessorFn: item => item.kind,
                          Cell: ({ row: { original: item } }) => (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <KubeIcon kind={item.kind as any} width="24px" height="24px" />
                              <Typography variant="body2" color="text.secondary">
                                {item.kind}
                              </Typography>
                            </Box>
                          ),
                          gridTemplate: 'min-content',
                        },
                        {
                          id: 'name',
                          header: t('Name'),
                          accessorFn: item => item.metadata.name,
                        },
                        {
                          id: 'actions',
                          header: t('Actions'),
                          gridTemplate: 'min-content',
                          accessorFn: item => item.metadata.uid,
                          Cell: ({ row: { original: item } }) => (
                            <ViewYaml item={{ ...item, jsonData: item } as any} />
                          ),
                        },
                      ]}
                    />
                  </Box>
                </Box>
              )}
              <DialogActions>
                <Button variant="contained" type="submit">
                  <Trans>Create</Trans>
                </Button>
              </DialogActions>
            </form>
          </>
        )}

        {creationState.stage === 'creating' && (
          <Box>
            <Typography variant="h1">{t('Creating project')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('Creating following resources in this project:')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {creationState.createdResources.map(resource => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KubeIcon kind={resource.kind as any} width="24px" height="24px" />
                  <Box>{resource.metadata.name}</Box>
                  <Box sx={theme => ({ color: theme.palette.success.main })}>
                    <Icon icon="mdi:check" />
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <KubeIcon
                  kind={creationState.creatingResource.kind as any}
                  width="24px"
                  height="24px"
                />
                <Box>{creationState.creatingResource.metadata.name}</Box>
                <CircularProgress size="1rem" />
              </Box>
            </Box>
          </Box>
        )}

        {creationState.stage === 'error' && (
          <Box>
            <Box>{t('Something went wrong')}</Box>
            <Box>{creationState.error.message}</Box>
          </Box>
        )}

        {creationState.stage === 'success' && (
          <Redirect to={createRouteURL('projectDetails', { projectId: creationState.projectId })} />
        )}
      </DialogContent>
    </>
  );
}
