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
import { loadAll } from 'js-yaml';
import { Dispatch, FormEvent, SetStateAction, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Trans, useTranslation } from 'react-i18next';
import { Redirect, useHistory } from 'react-router';
import { useClustersConf } from '../../lib/k8s';
import { apply } from '../../lib/k8s/api/v1/apply';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { ViewYaml } from '../advancedSearch/ResourceSearch';
import { DropZoneBox } from '../common/DropZoneBox';
import Table from '../common/Table';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { PROJECT_ID_LABEL, toKubernetesName } from './projectUtils';

/** A YAML document that cannot be created as a Kubernetes resource, and why. */
export interface RejectedYamlDocument {
  /** The 1-based position of the document in its file. */
  index: number;
  /** The required fields the document does not set, empty if it is not an object at all. */
  missingFields: string[];
}

/**
 * Splits parsed YAML documents into the Kubernetes resources a project can create and the
 * documents it cannot (scalars, lists or objects without a kind, apiVersion or metadata.name),
 * so each rejected document can be reported, like `kubectl apply` does. Empty documents are
 * dropped silently.
 */
export function splitKubernetesResources(docs: unknown[]): {
  resources: KubeObjectInterface[];
  rejected: RejectedYamlDocument[];
} {
  const resources: KubeObjectInterface[] = [];
  const rejected: RejectedYamlDocument[] = [];
  docs.forEach((doc, position) => {
    if (doc === null || doc === undefined) {
      return;
    }
    const index = position + 1;
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      rejected.push({ index, missingFields: [] });
      return;
    }
    const item = doc as Partial<KubeObjectInterface>;
    // An empty string is as unset as a missing field: the API server rejects both.
    const isSet = (value: unknown) => typeof value === 'string' && value !== '';
    const missingFields = [
      !isSet(item.apiVersion) && 'apiVersion',
      !isSet(item.kind) && 'kind',
      !isSet(item.metadata?.name) && 'metadata.name',
    ].filter((field): field is string => !!field);
    if (missingFields.length === 0) {
      resources.push(item as KubeObjectInterface);
    } else {
      rejected.push({ index, missingFields });
    }
  });
  return { resources, rejected };
}

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

  // Nothing else can be created without the namespace, so a failure here stops the creation.
  await apply(namespace, cluster);

  // Like `kubectl apply`, keep applying the other resources when one fails, then report every
  // failure.
  const created: KubeObjectInterface[] = [];
  const failed: FailedResource[] = [];
  for (const item of itemsToCreate) {
    setCreationState({
      stage: 'creating',
      createdResources: [namespace, ...created],
      creatingResource: item,
    });
    try {
      await apply(item, cluster);
      created.push(item);
    } catch (error) {
      failed.push({ resource: item, message: (error as Error).message });
    }
  }

  if (failed.length > 0) {
    setCreationState({ stage: 'partialFailure', name: k8sName, created, failed });
    return false;
  }

  setCreationState({
    stage: 'success',
    name: k8sName,
  });
  return true;
}

interface FailedResource {
  resource: KubeObjectInterface;
  message: string;
}

type CreationState =
  | { stage: 'form' }
  | {
      stage: 'creating';
      createdResources: KubeObjectInterface[];
      creatingResource: KubeObjectInterface;
    }
  | { stage: 'success'; name: string }
  | {
      stage: 'partialFailure';
      name: string;
      created: KubeObjectInterface[];
      failed: FailedResource[];
    }
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

  // YAML documents that were loaded but cannot be created, one message per document.
  const [rejectedDocuments, setRejectedDocuments] = useState<string[]>([]);

  const describeRejected = (source: string, rejected: RejectedYamlDocument[]) =>
    rejected.map(({ index, missingFields }) => {
      const reason =
        missingFields.length === 0
          ? t('not a Kubernetes object')
          : missingFields.map(field => t('{{field}} not set', { field })).join(', ');
      return t('{{source}}, document {{index}}: {{reason}}', { source, index, reason });
    });

  const { items: allProjectNamespaces } = Namespace.useList({
    clusters: allClusters ? Object.keys(allClusters) : [],
    labelSelector: PROJECT_ID_LABEL,
  });

  const existingProjectNames = useMemo(() => {
    const result = new Set<string>();
    if (!allProjectNamespaces) {
      return result;
    }

    for (const ns of allProjectNamespaces) {
      const labelValue = ns.metadata.labels?.[PROJECT_ID_LABEL];
      if (!labelValue) {
        continue;
      }

      // Store both the raw label and its Kubernetes-normalized form so that
      // duplicate detection works regardless of how PROJECT_ID_LABEL was set.
      result.add(labelValue);
      result.add(toKubernetesName(labelValue));
    }

    return result;
  }, [allProjectNamespaces]);

  const projectNameExists = k8sName.length > 0 && existingProjectNames.has(k8sName);

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
      const { resources, rejected } = splitKubernetesResources(loadAll(content));
      setItems(resources);
      setRejectedDocuments(describeRejected(yamlUrl, rejected));
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
      return new Promise<{ docs: KubeObjectInterface[]; rejected: string[] }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          try {
            const { resources, rejected } = splitKubernetesResources(loadAll(content));
            resolve({ docs: resources, rejected: describeRejected(file.name, rejected) });
          } catch (err) {
            console.error('Error parsing YAML file:', file.name, err);
            // Resolve with empty array for failed files
            resolve({ docs: [], rejected: [] });
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
        setRejectedDocuments(prev => [...prev, ...results.flatMap(result => result.rejected)]);
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
    if (projectNameExists) {
      errors.name = t('A project with this name already exists');
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
      const allCreated = await createProjectFromYaml({
        items,
        k8sName,
        cluster: selectedClusters!,
        setCreationState,
      });
      if (allCreated) {
        history.push(createRouteURL('projectDetails', { name: k8sName }));
      }
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
                    error={!!errors.name || projectNameExists}
                    helperText={
                      errors.name ||
                      (projectNameExists ? t('A project with this name already exists') : undefined)
                    }
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
                  {rejectedDocuments.length > 0 && (
                    <Box role="alert" sx={{ mb: 1 }}>
                      <Typography color="error">
                        {t(
                          'These YAML documents are not Kubernetes resources and will not be created:'
                        )}
                      </Typography>
                      <Box component="ul" sx={{ m: 0 }}>
                        {rejectedDocuments.map((message, index) => (
                          <Typography component="li" color="error" key={index}>
                            {message}
                          </Typography>
                        ))}
                      </Box>
                    </Box>
                  )}

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
                            <input {...getInputProps()} aria-label={t('Choose Files')} />
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

              {/* Also shown for uploads with only rejected documents, so they can be cleared. */}
              {(items.length > 0 || rejectedDocuments.length > 0) && (
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
                      onClick={() => {
                        setItems([]);
                        setRejectedDocuments([]);
                      }}
                      startIcon={<InlineIcon icon="mdi:delete" width={16} />}
                    >
                      {t('Clear All')}
                    </Button>
                  </Box>
                  {items.length > 0 && (
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
                  )}
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

        {creationState.stage === 'partialFailure' && (
          <Box>
            <Typography variant="h1">{t('Some resources could not be created')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('The project was created, but these resources failed to apply:')}
            </Typography>
            <Box component="ul" role="alert">
              {creationState.failed.map(({ resource, message }, index) => (
                <Typography component="li" color="error" key={`failed-${index}`}>
                  {t('{{kind}} {{name}}: {{message}}', {
                    kind: resource.kind,
                    name: resource.metadata.name,
                    message,
                  })}
                </Typography>
              ))}
            </Box>
            {creationState.created.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {t('Created resources:')}
                </Typography>
                <Box component="ul">
                  {creationState.created.map((resource, index) => (
                    <Typography component="li" key={`created-${index}`}>
                      {resource.kind} {resource.metadata.name}
                    </Typography>
                  ))}
                </Box>
              </>
            )}
            <DialogActions>
              <Button
                variant="contained"
                onClick={() => {
                  history.push(createRouteURL('projectDetails', { name: creationState.name }));
                }}
              >
                {t('Go to project')}
              </Button>
            </DialogActions>
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
