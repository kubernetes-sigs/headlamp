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

import { Box, TextField, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { ClusterSettings } from '../../../helpers/clusterSettings';
import { parseKubeConfig, renameCluster } from '../../../lib/k8s/api/v1/clusterApi';
import { Cluster } from '../../../lib/k8s/cluster';
import { setConfig, setStatelessConfig } from '../../../redux/configSlice';
import { findKubeconfigByClusterName } from '../../../stateless/findKubeconfigByClusterName';
import { updateStatelessClusterKubeconfig } from '../../../stateless/updateStatelessClusterKubeconfig';
import { ConfirmButton, ConfirmDialog, NameValueTable } from '../../common';
import { isValidClusterNameFormat } from './util';

interface ClusterNameEditorProps {
  cluster: string;
  clusterConf: {
    [clusterName: string]: Cluster;
  } | null;
  clusterSettings: ClusterSettings | null;
  setClusterSettings: React.Dispatch<React.SetStateAction<ClusterSettings | null>>;
}

export function ClusterNameEditor({
  cluster,
  clusterConf,
  clusterSettings,
  setClusterSettings,
}: ClusterNameEditorProps) {
  const { t } = useTranslation(['translation']);
  const [customNameInUse, setCustomNameInUse] = React.useState(false);
  const [clusterErrorDialogOpen, setClusterErrorDialogOpen] = React.useState(false);
  const [clusterErrorDialogMessage, setClusterErrorDialogMessage] = React.useState('');
  const [newClusterName, setNewClusterName] = React.useState(cluster || '');

  const dispatch = useDispatch();
  const history = useHistory();

  React.useEffect(() => {
    if (clusterSettings?.currentName !== cluster) {
      setNewClusterName(clusterSettings?.currentName || '');
    }
  }, [cluster, clusterSettings]);

  const clusterInfo = (clusterConf && clusterConf[cluster || '']) || null;
  const source = clusterInfo?.meta_data?.source;
  const originalName = clusterInfo?.meta_data?.originalName;
  const displayName = originalName || (clusterInfo ? clusterInfo.name : '');

  /** Note: display original name is currently only supported for non dynamic clusters from kubeconfig sources. */
  const clusterID = clusterInfo?.meta_data?.clusterID || '';

  const invalidClusterNameMessage = t(
    "translation|Cluster name must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

  /**
   * This function is part of a double check, this is meant to check all the cluster names currently in use as display names
   * Note: if the metadata is not available or does not load, another check is done in the backend to ensure the name is unique in its own config
   *
   * @param name The name to check.
   * @returns bool of if the name is in use.
   */
  function checkNameInUse(name: string) {
    if (!clusterConf) {
      return false;
    }
    /** These are the display names of the clusters, renamed clusters have their display name as the custom name */
    const clusterNames = Object.values(clusterConf).map(cluster => cluster.name);

    /** The original name of the cluster is the name used in the kubeconfig file. */
    const originalNames = Object.values(clusterConf)
      .map(cluster => cluster.meta_data?.originalName)
      .filter(originalName => originalName !== undefined);

    const allNames = [...clusterNames, ...originalNames];

    const nameInUse = allNames.includes(name);

    setCustomNameInUse(nameInUse);
  }

  function ClusterErrorDialog() {
    return (
      <ConfirmDialog
        onConfirm={() => {
          setClusterErrorDialogOpen(false);
        }}
        handleClose={() => {
          setClusterErrorDialogOpen(false);
        }}
        hideCancelButton
        open={clusterErrorDialogOpen}
        title={t('translation|Error')}
        description={clusterErrorDialogMessage}
        confirmLabel={t('translation|Okay')}
      ></ConfirmDialog>
    );
  }
  // Display the original name of the cluster if it was loaded from a kubeconfig file.
  function ClusterName() {
    const currentName = clusterInfo?.name;
    const originalName = clusterInfo?.meta_data?.originalName;
    const source = clusterInfo?.meta_data?.source;
    // Note: display original name is currently only supported for non dynamic clusters from kubeconfig sources.
    const displayOriginalName = source === 'kubeconfig' && originalName;

    return (
      <>
        {clusterErrorDialogOpen && <ClusterErrorDialog />}
        <Typography>{t('translation|Name')}</Typography>
        <div>
          {displayOriginalName && currentName !== displayOriginalName && (
            <Typography id="cluster-original-name" variant="body2" color="textSecondary">
              {t('translation|Original name: {{ displayName }}', {
                displayName: displayName,
              })}
            </Typography>
          )}
        </div>
      </>
    );
  }

  function storeNewClusterName(name: string) {
    let actualName = name;
    if (name === cluster) {
      actualName = '';
      setNewClusterName(actualName);
    }

    setClusterSettings((settings: ClusterSettings | null) => {
      const newSettings = { ...(settings || {}) };
      if (isValidClusterNameFormat(name)) {
        newSettings.currentName = actualName;
      }
      return newSettings;
    });
  }

  const handleUpdateClusterName = (source: string) => {
    try {
      renameCluster(cluster || '', newClusterName, source, clusterID)
        .then(async config => {
          if (cluster) {
            const kubeconfig = await findKubeconfigByClusterName(cluster, clusterID);
            if (kubeconfig !== null) {
              await updateStatelessClusterKubeconfig(kubeconfig, newClusterName, cluster);
              // Make another request for updated kubeconfig
              const updatedKubeconfig = await findKubeconfigByClusterName(cluster, clusterID);
              if (updatedKubeconfig !== null) {
                parseKubeConfig({ kubeconfig: updatedKubeconfig })
                  .then((config: any) => {
                    storeNewClusterName(newClusterName);
                    dispatch(setStatelessConfig(config));
                  })
                  .catch((err: Error) => {
                    console.error('Error updating cluster name:', err.message);
                  });
              }
            } else {
              dispatch(setConfig(config));
            }
          }
          history.push('/');
          window.location.reload();
        })
        .catch((err: Error) => {
          console.error('Error updating cluster name:', err.message);
          setClusterErrorDialogMessage(err.message);
          setClusterErrorDialogOpen(true);
        });
    } catch (error) {
      console.error('Error updating cluster name:', error);
    }
  };
  const isValidCurrentName = isValidClusterNameFormat(newClusterName);

  const hasOriginalName =
    source === 'kubeconfig' && originalName && clusterInfo?.name !== originalName;

  const clusterNameLabelID = 'cluster-name-label';
  const clusterOriginalNameID = 'cluster-original-name';

  return (
    <NameValueTable
      rows={[
        {
          name: <ClusterName />,
          nameID: clusterNameLabelID,
          value: (
            <TextField
              onChange={event => {
                let value = event.target.value;
                value = value.replace(' ', '');
                setNewClusterName(value);
                checkNameInUse(value);
              }}
              value={newClusterName}
              placeholder={cluster}
              error={!isValidCurrentName || customNameInUse}
              helperText={
                <Typography>
                  {!isValidCurrentName && invalidClusterNameMessage}
                  {customNameInUse &&
                    t(
                      'translation|This custom name is already in use, please choose a different name.'
                    )}
                  {isValidCurrentName &&
                    !customNameInUse &&
                    t('translation|The current name of the cluster. You can define a custom name')}
                </Typography>
              }
              inputProps={{
                'aria-labelledby': clusterNameLabelID,
                'aria-describedby': hasOriginalName ? clusterOriginalNameID : undefined,
              }}
              InputProps={{
                endAdornment: (
                  <Box display="flex" alignItems="center">
                    <ConfirmButton
                      onConfirm={() => {
                        if (isValidCurrentName) {
                          handleUpdateClusterName(source);
                        }
                      }}
                      confirmTitle={t('translation|Change name')}
                      confirmDescription={t(
                        'translation|Are you sure you want to change the name for "{{ clusterName }}"?',
                        { clusterName: displayName }
                      )}
                      disabled={!newClusterName || !isValidCurrentName || customNameInUse}
                    >
                      {t('translation|Apply')}
                    </ConfirmButton>
                  </Box>
                ),
                onKeyPress: event => {
                  if (event.key === 'Enter' && isValidCurrentName) {
                    handleUpdateClusterName(source);
                  }
                },
                autoComplete: 'off',
                sx: { maxWidth: 250 },
              }}
            />
          ),
        },
      ]}
    />
  );
}
