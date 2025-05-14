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
import { Button, Checkbox, FormControl, Grid, Tooltip } from '@mui/material';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import * as yaml from 'js-yaml';
import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useClustersConf } from '../../lib/k8s';
import { setCluster } from '../../lib/k8s/apiProxy';
import { setStatelessConfig } from '../../redux/configSlice';
import { DialogTitle } from '../common/Dialog';
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
    token: string;
    [key: string]: any;
  };
}

interface kubeconfig {
  clusters: Cluster[];
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
  const clusters: { [key: string]: Cluster } = {};
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

const WideButton = styled(Button)({
  width: '100%',
  maxWidth: '300px',
});

const enum Step {
  LoadKubeConfig,
  SelectClusters,
  ValidateKubeConfig,
  ConfigureClusters,
  Success,
}

function KubeConfigLoader() {
  const history = useHistory();
  const [state, setState] = useState(Step.LoadKubeConfig);
  const [error, setError] = React.useState('');
  const [fileContent, setFileContent] = useState<kubeconfig>({
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  });
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const configuredClusters = useClustersConf(); // Get already configured clusters

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
        setCluster({ kubeconfig: btoa(yaml.dump(selectedClusterConfig)) })
          .then(res => {
            if (res?.clusters?.length > 0) {
              dispatch(setStatelessConfig(res));
            }
            setState(Step.Success);
          })
          .catch(e => {
            console.debug('Error setting up clusters from kubeconfig:', e);
            setError(
              t('translation|Error setting up clusters, please load a valid kubeconfig file')
            );
            setState(Step.SelectClusters);
          });
      }
      loadClusters();
    }
    return () => {};
  }, [state]);

  const dispatch = useDispatch();
  const { t } = useTranslation(['translation']);

  const onDrop = (acceptedFiles: Blob[]) => {
    setError('');
    const reader = new FileReader();
    reader.onerror = () => setError(t("translation|Couldn't read kubeconfig file"));
    reader.onload = () => {
      try {
        const data = String.fromCharCode.apply(null, [
          ...new Uint8Array(reader.result as ArrayBuffer),
        ]);
        const doc = yaml.load(data) as kubeconfig;
        if (!doc.clusters) {
          throw new Error(t('translation|No clusters found!'));
        }
        if (!doc.contexts) {
          throw new Error(t('translation|No contexts found!'));
        }
        setFileContent(doc);
      } catch (err) {
        setError(
          t(`translation|Invalid kubeconfig file: {{ errorMessage }}`, {
            errorMessage: (err as Error).message,
          })
        );
        return;
      }
    };
    reader.readAsArrayBuffer(acceptedFiles[0]);
  };

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: onDrop,
    multiple: false,
  });

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

  function renderSwitch() {
    switch (state) {
      case Step.LoadKubeConfig:
        return (
          <Box>
            <DropZoneBox border={1} borderColor="secondary.main" {...getRootProps()}>
              <FormControl>
                <input {...getInputProps()} />
                <Tooltip
                  title={t('translation|Drag & drop or choose kubeconfig file here')}
                  placement="top"
                >
                  <Button
                    variant="contained"
                    onClick={() => open}
                    startIcon={<InlineIcon icon="mdi:upload" width={32} />}
                  >
                    {t('translation|Choose file')}
                  </Button>
                </Tooltip>
              </FormControl>
            </DropZoneBox>
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <WideButton onClick={() => history.goBack()}>{t('translation|Back')}</WideButton>
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
                              onChange={handleCheckboxChange}
                              color="primary"
                              checked={selectedClusters.includes(context.name)}
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
                        onClick={() => {
                          setState(Step.ValidateKubeConfig);
                        }}
                        disabled={selectedClusters.length === 0}
                      >
                        {t('translation|Next')}
                      </WideButton>
                    </Grid>
                    <Grid item>
                      <WideButton
                        onClick={() => {
                          setError('');
                          setState(Step.LoadKubeConfig);
                        }}
                      >
                        {t('translation|Back')}
                      </WideButton>
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
            <WideButton variant="contained" onClick={() => history.replace('/')}>
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
        <Box style={{ backgroundColor: 'red', textAlign: 'center', padding: '4px' }}>{error}</Box>
      ) : null}
      <Box>{renderSwitch()}</Box>
    </ClusterDialog>
  );
}

export default KubeConfigLoader;
