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

import { InlineIcon } from '@iconify/react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import * as yaml from 'js-yaml';
import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { encodeBase64 } from '../../helpers/base64';
import { useClustersConf } from '../../lib/k8s';
import { setCluster } from '../../lib/k8s/api/v1/clusterApi';
import { setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { mergeStatelessConfigState } from '../../stateless';
import { DialogTitle } from '../common/Dialog';
import { DropZoneBox } from '../common/DropZoneBox';
import Loader from '../common/Loader';
import { ClusterDialog } from './Chooser';

interface Cluster {
  name: string;
  cluster: {
    server: string;
    [key: string]: any;
  };
}

interface User {
  name: string;
  user: {
    token?: string;
    [key: string]: any;
  };
}

interface kubeconfig {
  clusters: Cluster[];
  users: User[];
  contexts: { name: string; context: { cluster: string; user?: string } }[];
  currentContext: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKubeconfig(
  value: unknown
): value is Pick<kubeconfig, 'clusters' | 'contexts'> & { users?: User[] | null } {
  return (
    isRecord(value) &&
    Array.isArray(value.clusters) &&
    value.clusters.length > 0 &&
    value.clusters.every(
      entry =>
        isRecord(entry) &&
        typeof entry.name === 'string' &&
        entry.name.length > 0 &&
        isRecord(entry.cluster) &&
        typeof entry.cluster.server === 'string' &&
        entry.cluster.server.length > 0
    ) &&
    (value.users === undefined ||
      value.users === null ||
      (Array.isArray(value.users) &&
        value.users.every(
          entry =>
            isRecord(entry) &&
            typeof entry.name === 'string' &&
            entry.name.length > 0 &&
            isRecord(entry.user) &&
            (entry.user.token === undefined || typeof entry.user.token === 'string')
        ))) &&
    Array.isArray(value.contexts) &&
    value.contexts.length > 0 &&
    value.contexts.every(
      entry =>
        isRecord(entry) &&
        typeof entry.name === 'string' &&
        entry.name.length > 0 &&
        isRecord(entry.context) &&
        typeof entry.context.cluster === 'string' &&
        entry.context.cluster.length > 0 &&
        (entry.context.user === undefined || typeof entry.context.user === 'string')
    )
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error('File reading was aborted'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Expected file contents as an ArrayBuffer'));
        return;
      }
      resolve(new TextDecoder().decode(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

function configWithSelectedClusters(config: kubeconfig, selectedClusters: string[]): kubeconfig {
  const newConfig: kubeconfig = {
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  };

  const contextDefinitions = new Map(config.contexts.map(context => [context.name, context]));
  const clusterDefinitions = new Map(config.clusters.map(cluster => [cluster.name, cluster]));
  const userDefinitions = new Map(config.users.map(user => [user.name, user]));
  const clusters = new Map<string, Cluster>();
  const users = new Map<string, User>();
  let anonymousUser: User | undefined;

  selectedClusters.forEach(clusterName => {
    const context = contextDefinitions.get(clusterName);
    if (!context) {
      return;
    }

    const cluster = clusterDefinitions.get(context.context.cluster);
    if (!cluster) {
      return;
    }
    clusters.set(cluster.name, cluster);

    let selectedContext = context;
    let user = userDefinitions.get(context.context.user ?? '');
    // The backend parser requires a named user even for anonymous contexts.
    if (!context.context.user) {
      if (!anonymousUser) {
        let name = 'headlamp-anonymous';
        for (let suffix = 1; userDefinitions.has(name); suffix++) {
          name = `headlamp-anonymous-${suffix}`;
        }
        anonymousUser = { name, user: {} };
      }
      user = anonymousUser;
      selectedContext = {
        ...context,
        context: { ...context.context, user: anonymousUser.name },
      };
    }
    if (user) {
      users.set(user.name, user);
    }

    newConfig.contexts.push(selectedContext);
  });

  newConfig.clusters = [...clusters.values()];
  newConfig.users = [...users.values()];

  return newConfig;
}

const WideButton = styled(Button)({
  width: '100%',
  maxWidth: '300px',
});

export enum Step {
  LoadKubeConfig,
  SelectClusters,
  ValidateKubeConfig,
  ConfigureClusters,
  Success,
}

interface ImportMessageProps {
  message: string;
  details?: string[];
}

function ImportMessage({ message, details }: ImportMessageProps) {
  return (
    <Box>
      {details?.length ? (
        <AlertTitle>{message}</AlertTitle>
      ) : (
        <Typography variant="body2">{message}</Typography>
      )}
      {!!details?.length && (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </Box>
      )}
    </Box>
  );
}

export interface PureKubeConfigLoaderProps {
  /** The current step in the loading process */
  step: Step;
  /** Error message to display */
  error?: string;
  /** Per-file details for a failed import */
  errorDetails?: string[];
  /** Non-blocking warnings about the imported files */
  warnings?: ImportMessageProps[];
  /** The parsed kubeconfig file content */
  fileContent: kubeconfig;
  /** List of selected cluster names */
  selectedClusters: string[];
  /** Callback for when a file is dropped or chosen */
  onDrop: (acceptedFiles: File[]) => void;
  /** Callback for checkbox changes in cluster selection */
  onCheckboxChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Callback for 'Next' button */
  onNext: () => void;
  /** Callback for 'Back' button */
  onBack: () => void;
  /** Callback for 'Finish' button */
  onFinish: () => void;
  /** Callback for 'Cancel/Back' button in initial step */
  onCancel: () => void;
}

export function PureKubeConfigLoader(props: PureKubeConfigLoaderProps) {
  const {
    step,
    error,
    errorDetails,
    warnings = [],
    fileContent,
    selectedClusters,
    onDrop,
    onCheckboxChange,
    onNext,
    onBack,
    onFinish,
    onCancel,
  } = props;
  const { t } = useTranslation(['translation']);
  const selectedClusterNames = new Set(selectedClusters);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles: File[]) => onDrop(acceptedFiles),
    multiple: true,
  });

  function renderSwitch() {
    switch (step) {
      case Step.LoadKubeConfig:
        return (
          <Box>
            <DropZoneBox border={1} borderColor="secondary.main" {...getRootProps()}>
              <FormControl>
                <input {...getInputProps()} />
                <Tooltip
                  title={t('translation|Drag & drop or choose kubeconfig files here')}
                  placement="top"
                >
                  <Button
                    variant="contained"
                    startIcon={<InlineIcon icon="mdi:upload" width={32} />}
                  >
                    {t('translation|Choose files')}
                  </Button>
                </Tooltip>
              </FormControl>
            </DropZoneBox>
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <WideButton onClick={onCancel}>{t('translation|Back')}</WideButton>
            </Box>
          </Box>
        );
      case Step.SelectClusters:
        return (
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              alignItems: 'center',
            }}
          >
            <Typography>{t('translation|Select clusters')}</Typography>
            {fileContent.clusters ? (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    justifyContent: 'center',
                    padding: '15px',
                    width: '100%',
                    maxWidth: '300px',
                  }}
                >
                  <FormControl
                    sx={{
                      overflowY: 'auto',
                      height: '150px',
                      paddingLeft: '10px',
                      paddingRight: '10px',
                      width: '100%',
                    }}
                  >
                    {fileContent.contexts.map(context => {
                      return (
                        <FormControlLabel
                          key={context.name}
                          control={
                            <Checkbox
                              value={context.name}
                              name={context.name}
                              onChange={onCheckboxChange}
                              color="primary"
                              checked={selectedClusterNames.has(context.name)}
                            />
                          }
                          label={context.name}
                        />
                      );
                    })}
                  </FormControl>
                  <Grid
                    container
                    direction="column"
                    spacing={2}
                    justifyContent="center"
                    alignItems="stretch"
                  >
                    <Grid item>
                      <WideButton
                        variant="contained"
                        color="primary"
                        onClick={onNext}
                        disabled={selectedClusters.length === 0}
                      >
                        {t('translation|Next')}
                      </WideButton>
                    </Grid>
                    <Grid item>
                      <WideButton onClick={onBack}>{t('translation|Back')}</WideButton>
                    </Grid>
                  </Grid>
                </Box>
              </>
            ) : null}
          </Box>
        );
      case Step.ValidateKubeConfig:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography>{t('translation|Validating selected clusters')}</Typography>
            <Loader title={t('translation|Validating selected clusters')} />
          </Box>
        );
      case Step.ConfigureClusters:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography>{t('translation|Setting up clusters')}</Typography>
            <Loader title={t('translation|Setting up clusters')} />
          </Box>
        );
      case Step.Success:
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
              alignItems: 'center',
            }}
          >
            <Box style={{ padding: '32px' }}>
              <Typography>{t('translation|Clusters successfully set up!')}</Typography>
            </Box>
            <WideButton variant="contained" onClick={onFinish}>
              {t('translation|Finish')}
            </WideButton>
          </Box>
        );
    }
  }

  return (
    <ClusterDialog
      showInfoButton={false}
      // Disable backdrop clicking.
      onClose={() => {}}
      useCover
    >
      <DialogTitle>{t('translation|Load from KubeConfig')}</DialogTitle>
      {error && error !== '' ? (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
          <ImportMessage message={error} details={errorDetails} />
        </Alert>
      ) : null}
      {warnings.length > 0 && (step === Step.LoadKubeConfig || step === Step.SelectClusters) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {warnings.map((warning, index) => (
            <ImportMessage key={index} {...warning} />
          ))}
        </Alert>
      )}
      <Box>{renderSwitch()}</Box>
    </ClusterDialog>
  );
}

function KubeConfigLoader() {
  const history = useHistory();
  const [state, setState] = useState(Step.LoadKubeConfig);
  const [error, setError] = React.useState('');
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<ImportMessageProps[]>([]);
  const [fileContent, setFileContent] = useState<kubeconfig>({
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  });
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const configuredClusters = useClustersConf(); // Get already configured clusters
  const dispatch = useDispatch();
  const { t } = useTranslation(['translation']);

  useEffect(() => {
    if (fileContent.contexts.length > 0) {
      setSelectedClusters(fileContent.contexts.map(context => context.name));
      setState(Step.SelectClusters);
    }
    return () => {};
  }, [fileContent]);

  useEffect(() => {
    if (state === Step.ValidateKubeConfig) {
      const alreadyConfiguredClusters = selectedClusters.filter(
        clusterName => configuredClusters && configuredClusters[clusterName]
      );

      if (alreadyConfiguredClusters.length > 0) {
        setError(
          t(
            'translation|Duplicate cluster: {{ clusterNames }} in the list. Please edit the context name.',
            {
              clusterNames: alreadyConfiguredClusters.join(', '),
            }
          )
        );
        setState(Step.SelectClusters);
      } else {
        setState(Step.ConfigureClusters);
      }
    }
    if (state === Step.ConfigureClusters) {
      function loadClusters() {
        const selectedClusterConfig = configWithSelectedClusters(fileContent, selectedClusters);
        setCluster({ kubeconfig: encodeBase64(yaml.dump(selectedClusterConfig)) })
          .then(parsedConfig => {
            if (parsedConfig?.clusters?.length > 0) {
              const currentStatelessClusters = store.getState().config.statelessClusters;
              dispatch(
                setStatelessConfig(
                  mergeStatelessConfigState(currentStatelessClusters, parsedConfig)
                )
              );
            }
            setState(Step.Success);
          })
          .catch(e => {
            console.error('Error setting up clusters from kubeconfig:', e);
            setError(
              t('translation|Error setting up clusters, please load a valid kubeconfig file')
            );
            setState(Step.SelectClusters);
          });
      }
      loadClusters();
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onDrop = async (acceptedFiles: File[]) => {
    setError('');
    setErrorDetails([]);
    setWarnings([]);
    if (acceptedFiles.length === 0) {
      setError(t('translation|No kubeconfig files selected'));
      return;
    }

    const mergedConfig: kubeconfig = {
      clusters: [],
      users: [],
      contexts: [],
      currentContext: '',
    };
    const failures: string[] = [];
    const duplicates: string[] = [];
    const seenClusterNames = new Set<string>();
    const seenUserNames = new Set<string>();
    const seenContextNames = new Set<string>();

    function mergeEntries<T extends { name: string }>(
      entries: T[],
      mergedEntries: T[],
      seenNames: Set<string>,
      fileName: string,
      entryType: string
    ) {
      for (const entry of entries) {
        if (seenNames.has(entry.name)) {
          duplicates.push(`${fileName}: ${entryType} "${entry.name}"`);
        } else {
          seenNames.add(entry.name);
          mergedEntries.push(entry);
        }
      }
    }

    for (const file of acceptedFiles) {
      try {
        const doc: unknown = yaml.load(await readFileAsText(file));
        if (!isKubeconfig(doc)) {
          throw new Error(t('translation|Invalid kubeconfig structure'));
        }
        const clusterNames = new Set(doc.clusters.map(cluster => cluster.name));
        if (doc.contexts.some(context => !clusterNames.has(context.context.cluster))) {
          throw new Error(t('translation|Kubeconfig contexts reference missing clusters'));
        }
        const userNames = new Set((doc.users ?? []).map(user => user.name));
        if (doc.contexts.some(({ context }) => context.user && !userNames.has(context.user))) {
          throw new Error(t('translation|Kubeconfig contexts reference missing users'));
        }
        mergeEntries(
          doc.clusters,
          mergedConfig.clusters,
          seenClusterNames,
          file.name,
          t('translation|Cluster')
        );
        mergeEntries(
          doc.users ?? [],
          mergedConfig.users,
          seenUserNames,
          file.name,
          t('translation|User')
        );
        mergeEntries(
          doc.contexts,
          mergedConfig.contexts,
          seenContextNames,
          file.name,
          t('translation|Context')
        );
      } catch (err) {
        console.error('Error loading kubeconfig file:', file.name, err);
        failures.push(
          `${file.name}: ${
            err instanceof Error ? err.message : t("translation|Couldn't read kubeconfig file")
          }`
        );
      }
    }

    if (mergedConfig.contexts.length === 0) {
      setError(t('translation|No valid kubeconfig contexts found in the selected files'));
      setErrorDetails(failures);
      return;
    }

    const importWarnings: ImportMessageProps[] = [];
    if (failures.length > 0) {
      importWarnings.push({
        message: t('translation|{{ count }} file could not be loaded', { count: failures.length }),
        details: failures,
      });
    }
    if (duplicates.length > 0) {
      importWarnings.push({
        message: t('translation|Duplicate kubeconfig entries were skipped (first occurrence wins)'),
        details: duplicates,
      });
    }
    setWarnings(importWarnings);
    setFileContent(mergedConfig);
  };

  function handleCheckboxChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.checked) {
      // remove from selected clusters
      setSelectedClusters(selectedClusters =>
        selectedClusters.filter(cluster => cluster !== event.target.name)
      );
    } else {
      // add to selected clusters
      setSelectedClusters(selectedClusters => [...selectedClusters, event.target.name]);
    }
  }

  return (
    <PureKubeConfigLoader
      step={state}
      error={error}
      errorDetails={errorDetails}
      warnings={warnings}
      fileContent={fileContent}
      selectedClusters={selectedClusters}
      onDrop={onDrop}
      onCheckboxChange={handleCheckboxChange}
      onNext={() => {
        setError('');
        setErrorDetails([]);
        setWarnings([]);
        setState(Step.ValidateKubeConfig);
      }}
      onBack={() => {
        setError('');
        setErrorDetails([]);
        setWarnings([]);
        setState(Step.LoadKubeConfig);
      }}
      onFinish={() => history.replace('/')}
      onCancel={() => history.goBack()}
    />
  );
}

export default KubeConfigLoader;
