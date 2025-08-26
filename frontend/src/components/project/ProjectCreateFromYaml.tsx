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
  Grid,
  Input,
  TextField,
  Typography,
} from '@mui/material';
import { loadAll } from 'js-yaml';
import { Dispatch, FormEvent, SetStateAction, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Redirect, useHistory } from 'react-router';
import { useClustersConf } from '../../lib/k8s';
import { ApiError, apply } from '../../lib/k8s/apiProxy';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { createRouteURL } from '../../lib/router';
import { ViewYaml } from '../advancedSearch/ResourceSearch';
import Table from '../common/Table';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { toKubernetesName } from './projectUtils';

async function createProjectFromYaml({
  items,
  k8sName,
  cluster,
  setCreationState,
}: {
  items: KubeObjectInterface[];
  k8sName: string;
  cluster: string;
  setCreationState: Dispatch<SetStateAction<CreationState>>;
}) {
  const itemsToCreate = structuredClone(items);

  itemsToCreate.forEach(item => {
    item.metadata.namespace = k8sName;
  });

  const namespace = {
    kind: 'Namespace',
    apiVersion: 'v1',
    metadata: {
      name: k8sName,
      labels: {
        PROJECT_ID_LABEL: k8sName,
      },
    } as any,
  } as any;

  setCreationState({
    stage: 'creating',
    createdResources: [],
    creatingResource: namespace,
  });

  await apply(namespace, cluster);

  for (const item of itemsToCreate) {
    setCreationState(state => ({
      stage: 'creating',
      createdResources:
        state.stage === 'creating' ? [...state.createdResources, state.creatingResource] : [],
      creatingResource: item,
    }));
    await apply(item, cluster);
  }

  setCreationState({
    stage: 'success',
    name: k8sName,
  });
}

type CreationState =
  | { stage: 'form' }
  | {
      stage: 'creating';
      createdResources: KubeObjectInterface[];
      creatingResource: KubeObjectInterface;
    }
  | { stage: 'success'; name: string }
  | { stage: 'error'; error: ApiError };

export function CreateNew() {
  const { t } = useTranslation();
  const [items, setItems] = useState<KubeObjectInterface[]>([]);
  const [name, setName] = useState('');
  const allClusters = useClustersConf();
  const [selectedClusters, setSelectedClusters] = useState<string | null>(null);
  const k8sName = toKubernetesName(name);
  const history = useHistory();

  const [creationState, setCreationState] = useState<CreationState>({
    stage: 'form',
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
      await createProjectFromYaml({
        items,
        k8sName,
        cluster: selectedClusters!,
        setCreationState,
      });
      history.push(createRouteURL('projectDetails', { name: k8sName }));
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
                {t('Create new Project from YAML')}
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
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => {
                    history.push(createRouteURL('chooser'));
                  }}
                >
                  <Trans>Cancel</Trans>
                </Button>
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
          <Redirect to={createRouteURL('projectDetails', { name: creationState.name })} />
        )}
      </DialogContent>
    </>
  );
}
