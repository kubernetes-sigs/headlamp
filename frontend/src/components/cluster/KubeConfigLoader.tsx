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
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import * as yaml from 'js-yaml';
import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import { setCluster } from '../../lib/k8s/api/v1/clusterApi';
import { Cluster } from '../../lib/k8s/cluster';
import { setStatelessConfig } from '../../redux/configSlice';
import { DialogTitle } from '../common/Dialog';
import { DropZoneBox } from '../common/DropZoneBox';
import Loader from '../common/Loader';
import { ClusterDialog } from './Chooser';

interface KubeConfigCluster {
  name: string;
  cluster: {
    server: string;
    [key: string]: any;
  };
}

interface User {
  name: string;
  user: {
    token: string;
    [key: string]: any;
  };
}

interface kubeconfig {
  clusters: KubeConfigCluster[];
  users: User[];
  contexts: { name: string; context: { cluster: string; user: string } }[];
  currentContext: string;
}

function configWithSelectedClusters(config: kubeconfig, selectedClusters: string[]): kubeconfig {
  const newConfig: kubeconfig = {
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  };

  // We use a map to avoid duplicates since many contexts can point to the same cluster/user.
  const clusters: { [key: string]: KubeConfigCluster } = {};
  const users: { [key: string]: User } = {};

  selectedClusters.forEach(clusterName => {
    const context = config.contexts.find(c => c.name === clusterName);
    if (!context) {
      return;
    }

    const cluster = config.clusters.find(c => c.name === context.context.cluster);
    if (!cluster) {
      return;
    }
    clusters[cluster.name] = cluster;

    // Optionally add the user.
    const user = config.users?.find(c => c.name === context.context.user);
    if (!!user) {
      users[user.name] = user;
    }

    newConfig.contexts.push(context);
  });

  newConfig.clusters = Object.values(clusters);
  newConfig.users = Object.values(users);

  return newConfig;
}

const WideButton = styled(Button)({
  width: '100%',
  maxWidth: '300px',
});

export enum Step {
  UploadKubeConfig,
  SelectClusters,
  ValidateKubeConfig,
  ConfigureClusters,
  Success,
}

export interface PureKubeConfigLoaderProps {
  /** The current step in the loading process */
  step: Step;
  /** Error message to display */
  error?: string;
  /** The parsed kubeconfig file content */
  fileContent: kubeconfig | null;
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

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: (acceptedFiles: File[]) => onDrop(acceptedFiles),
    multiple: false,
    noClick: true,
  });

  function renderSwitch() {
    switch (step) {
      case Step.UploadKubeConfig:
        return (
          <Box>
            <DropZoneBox border={1} borderColor="secondary.main" {...getRootProps()}>
              <FormControl>
                <input {...getInputProps()} />
                <Tooltip title={t('Drag & drop or choose kubeconfig file here')} placement="top">
                  <Button
                    variant="contained"
                    onClick={open}
                    startIcon={<InlineIcon icon="mdi:upload" width={32} />}
                  >
                    {t('Choose file')}
                  </Button>
                </Tooltip>
              </FormControl>
            </DropZoneBox>
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <WideButton onClick={onCancel}>{t('Back')}</WideButton>
            </Box>
          </Box>
        );
      case Step.SelectClusters: {
        // Optimize lookup: precompute a map of cluster name to cluster object
        const clusterMap = new Map<string, KubeConfigCluster>();
        (fileContent?.clusters ?? []).forEach(c => clusterMap.set(c.name, c));

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
            {/* Step title is now in the DialogTitle component */}
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                maxHeight: '300px',
                width: '100%',
                marginBottom: '20px',
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>{t('Context Name')}</TableCell>
                    <TableCell>{t('Server URL')}</TableCell>
                    <TableCell>{t('User')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(fileContent?.contexts ?? []).map(context => {
                    const cluster = clusterMap.get(context.context.cluster);
                    const serverUrl = cluster?.cluster?.server || t('Unknown');

                    return (
                      <TableRow key={context.name} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            value={context.name}
                            name={context.name}
                            onChange={onCheckboxChange}
                            color="primary"
                            checked={selectedClusters.includes(context.name)}
                            inputProps={{
                              'aria-label': t('Select {{contextName}}', {
                                contextName: context.name,
                              }),
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{context.name}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                          {serverUrl}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {context.context.user || t('N/A')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Grid
              container
              direction="column"
              spacing={2}
              justifyContent="center"
              alignItems="stretch"
              sx={{ maxWidth: '300px' }}
            >
              <Grid item>
                <WideButton
                  variant="contained"
                  color="primary"
                  onClick={onNext}
                  disabled={selectedClusters.length === 0}
                >
                  {t('Next')}
                </WideButton>
              </Grid>
              <Grid item>
                <WideButton onClick={onBack}>{t('Back')}</WideButton>
              </Grid>
            </Grid>
          </Box>
        );
      }
      case Step.ValidateKubeConfig:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography variant="h6">{t('Validating selected clusters')}</Typography>
            <Loader title={t('Validating selected clusters')} />
          </Box>
        );
      case Step.ConfigureClusters:
        return (
          <Box style={{ textAlign: 'center' }}>
            <Typography variant="h6">{t('Setting up clusters')}</Typography>
            <Loader title={t('Setting up clusters')} />
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
              <Typography>{t('Clusters successfully set up!')}</Typography>
            </Box>
            <WideButton variant="contained" onClick={onFinish}>
              {t('Finish')}
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
      aria-labelledby="kubeconfig-loader-heading"
    >
      <DialogTitle>
        <span id="kubeconfig-loader-heading">
          {step === Step.SelectClusters ? t('Select clusters to add') : t('Load from KubeConfig')}
        </span>
      </DialogTitle>
      {error && error !== '' ? (
        <Box
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            textAlign: 'center',
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '4px',
          }}
        >
          {error}
        </Box>
      ) : null}
      <Box>{renderSwitch()}</Box>
    </ClusterDialog>
  );
}

function KubeConfigLoader() {
  const history = useHistory();
  const [state, setState] = useState(Step.UploadKubeConfig);
  const [error, setError] = React.useState('');
  const [fileContent, setFileContent] = useState<kubeconfig | null>(null);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const configuredClusters = useClustersConf(); // Get already configured clusters
  const dispatch = useDispatch();
  const { t } = useTranslation(['translation']);

  useEffect(() => {
    if (fileContent && fileContent.contexts.length > 0) {
      setSelectedClusters(fileContent.contexts.map(context => context.name));
      setState(Step.SelectClusters);
    }
    return () => {};
  }, [fileContent]);

  useEffect(() => {
    if (state !== Step.ValidateKubeConfig) {
      return;
    }

    const alreadyConfiguredClusters = selectedClusters.filter(
      clusterName => configuredClusters && configuredClusters[clusterName]
    );

    if (alreadyConfiguredClusters.length > 0) {
      setError(
        t('Duplicate cluster: {{ clusterNames }} in the list. Please edit the context name.', {
          clusterNames: alreadyConfiguredClusters.join(', '),
        })
      );
      setState(Step.SelectClusters);
    } else {
      setState(Step.ConfigureClusters);
    }
  }, [state, selectedClusters, configuredClusters, t]);

  useEffect(() => {
    if (state !== Step.ConfigureClusters || !fileContent) {
      return;
    }

    let active = true;

    const selectedClusterConfig = configWithSelectedClusters(fileContent, selectedClusters);
    setCluster({ kubeconfig: btoa(yaml.dump(selectedClusterConfig)) })
      .then(res => {
        if (!active) {
          return;
        }
        if (res?.clusters?.length > 0) {
          const clusterMap = res.clusters.reduce(
            (acc: Record<string, Cluster>, cluster: Cluster) => {
              acc[cluster.name] = cluster;
              return acc;
            },
            {}
          );
          dispatch(setStatelessConfig({ statelessClusters: clusterMap }));
        }
        setState(Step.Success);
      })
      .catch(e => {
        if (!active) {
          return;
        }
        console.debug('Error setting up clusters from kubeconfig:', e);
        setError(t('Error setting up clusters, please load a valid kubeconfig file'));
        setState(Step.SelectClusters);
      });

    return () => {
      active = false;
    };
  }, [state, fileContent, selectedClusters, dispatch, t]);

  const onDrop = (acceptedFiles: File[]) => {
    setError('');
    const reader = new FileReader();
    reader.onerror = () => setError(t("Couldn't read kubeconfig file"));
    reader.onload = () => {
      try {
        const data = new TextDecoder().decode(reader.result as ArrayBuffer);
        const doc = yaml.load(data) as kubeconfig;
        if (!doc.clusters) {
          throw new Error(t('No clusters found!'));
        }
        if (!doc.contexts) {
          throw new Error(t('No contexts found!'));
        }
        setFileContent(doc);
      } catch (err) {
        setError(
          t(`Invalid kubeconfig file: {{ errorMessage }}`, {
            errorMessage: (err as Error).message,
          })
        );
        return;
      }
    };
    reader.readAsArrayBuffer(acceptedFiles[0]);
  };

  function handleCheckboxChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, checked } = event.target;
    setSelectedClusters(prev => {
      if (checked) {
        return [...prev, name];
      }
      return prev.filter(c => c !== name);
    });
  }

  return (
    <PureKubeConfigLoader
      step={state}
      error={error}
      fileContent={fileContent}
      selectedClusters={selectedClusters}
      onDrop={onDrop}
      onCheckboxChange={handleCheckboxChange}
      onNext={() => setState(Step.ValidateKubeConfig)}
      onBack={() => {
        setError('');
        setState(Step.UploadKubeConfig);
      }}
      onFinish={() => history.replace('/')}
      onCancel={() => history.goBack()}
    />
  );
}

export default KubeConfigLoader;
