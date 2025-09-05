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

import { Icon, InlineIcon } from '@iconify/react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  FormControl,
  Grid,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { styled } from '@mui/system';
import { loadAll } from 'js-yaml';
import { Dispatch, FormEvent, SetStateAction, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Trans, useTranslation } from 'react-i18next';
import { Redirect, useHistory } from 'react-router';
import { useClustersConf } from '../../lib/k8s';
import { apply } from '../../lib/k8s/api/v1/apply';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { ViewYaml } from '../advancedSearch/ResourceSearch';
import Table from '../common/Table';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { PROJECT_ID_LABEL, toKubernetesName } from './projectUtils';

const DropZoneBox = styled(Box)({
  border: 1,
  borderRadius: 1,
  borderWidth: 2,
  borderColor: 'rgba(0, 0, 0)',
  borderStyle: 'dashed',
  padding: '20px',
  margin: '20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  '&:hover': {
    borderColor: 'rgba(0, 0, 0, 0.5)',
  },
  '&:focus-within': {
    borderColor: 'rgba(0, 0, 0, 0.5)',
  },
});

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
        [PROJECT_ID_LABEL]: k8sName,
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

  // New state for URL and tab management
  const [currentTab, setCurrentTab] = useState(0);
  const [yamlUrl, setYamlUrl] = useState('');
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);

  // Function to load YAML from URL
  const loadFromUrl = async () => {
    if (!yamlUrl.trim()) {
      setErrors(prev => ({ ...prev, url: t('URL is required') }));
      return;
    }

    setIsLoadingFromUrl(true);
    setErrors(prev => ({ ...prev, url: '' }));

    try {
      const response = await fetch(yamlUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const content = await response.text();
      const docs = loadAll(content) as KubeObjectInterface[];
      const validDocs = docs.filter(doc => !!doc);
      setItems(validDocs);
      setErrors(prev => ({ ...prev, items: '' }));
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        url: t('Failed to load from URL: {{error}}', {
          error: (error as Error).message,
        }),
      }));
    } finally {
      setIsLoadingFromUrl(false);
    }
  };

  // File drop functionality
  const onDrop = (acceptedFiles: File[]) => {
    setErrors(prev => ({ ...prev, items: '' }));

    const promises = acceptedFiles.map(file => {
      return new Promise<{ docs: KubeObjectInterface[] }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          try {
            const docs = loadAll(content) as KubeObjectInterface[];
            const validDocs = docs.filter(doc => !!doc);
            resolve({ docs: validDocs });
          } catch (err) {
            console.error('Error parsing YAML file:', file.name, err);
            // Resolve with empty array for failed files
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
        setItems(prevItems => [...prevItems, ...newDocs]);
      })
      .catch(err => {
        console.error('An error occurred while processing files.', err);
        setErrors(prev => ({
          ...prev,
          items: t('Error processing files: {{error}}', {
            error: (err as Error).message,
          }),
        }));
      });
  };

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    accept: {
      'application/x-yaml': ['.yaml', '.yml'],
      'text/yaml': ['.yaml', '.yml'],
      'text/plain': ['.yaml', '.yml'],
    },
    multiple: true,
  });

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
                  <Typography>{t('Load resources')}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('Upload files or load from URL')}
                  </Typography>
                </Grid>
                <Grid item xs={9}>
                  {errors.items && <Typography color="error">{errors.items}</Typography>}

                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                      <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)}>
                        <Tab label={t('Upload Files')} />
                        <Tab label={t('Load from URL')} />
                      </Tabs>
                    </Box>

                    {/* File Upload Tab */}
                    {currentTab === 0 && (
                      <Box sx={{ pt: 2 }}>
                        <DropZoneBox border={1} borderColor="secondary.main" {...getRootProps()}>
                          <FormControl>
                            <input {...getInputProps()} />
                            <Tooltip
                              title={t('Drag & drop YAML files here or click to choose files')}
                              placement="top"
                            >
                              <Button
                                variant="contained"
                                onClick={open}
                                startIcon={<InlineIcon icon="mdi:upload" width={24} />}
                              >
                                {t('Choose Files')}
                              </Button>
                            </Tooltip>
                          </FormControl>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {t('Supports .yaml and .yml files')}
                          </Typography>
                        </DropZoneBox>
                      </Box>
                    )}

                    {/* URL Loading Tab */}
                    {currentTab === 1 && (
                      <Box sx={{ pt: 2 }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                          <TextField
                            fullWidth
                            label={t('YAML URL')}
                            placeholder={t('Enter URL to YAML file')}
                            variant="outlined"
                            size="small"
                            value={yamlUrl}
                            onChange={e => setYamlUrl(e.target.value)}
                            error={!!errors.url}
                            helperText={errors.url}
                            disabled={isLoadingFromUrl}
                          />
                          <Button
                            variant="contained"
                            onClick={loadFromUrl}
                            disabled={isLoadingFromUrl || !yamlUrl.trim()}
                            startIcon={
                              isLoadingFromUrl ? (
                                <CircularProgress size={16} />
                              ) : (
                                <InlineIcon icon="mdi:download" width={24} />
                              )
                            }
                          >
                            {isLoadingFromUrl ? t('Loading...') : t('Load')}
                          </Button>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {t('Load YAML resources from a remote URL')}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>

              {items.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Typography>
                      {t('Loaded Resources ({{count}})', { count: items.length })}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setItems([])}
                      startIcon={<InlineIcon icon="mdi:delete" width={16} />}
                    >
                      {t('Clear All')}
                    </Button>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
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
                          id: 'apiVersion',
                          header: t('API Version'),
                          accessorFn: item => item.apiVersion,
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
              {creationState.createdResources.map((resource, index) => (
                <Box
                  key={`created-${resource.kind}-${resource.metadata.name}-${index}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
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
