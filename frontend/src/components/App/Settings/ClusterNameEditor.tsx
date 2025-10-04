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
import { Cluster } from '../../../lib/k8s/cluster';
import { ConfirmButton, ConfirmDialog, NameValueTable } from '../../common';
import { isValidClusterNameFormat } from './util';

interface ClusterNameEditorProps {
  cluster: string;
  clusterConf: {
    [clusterName: string]: Cluster;
  } | null;
  newClusterName: string;
  setNewClusterName: (value: React.SetStateAction<string>) => void;
  clusterErrorDialogMessage: string;
  clusterErrorDialogOpen: boolean;
  setClusterErrorDialogOpen: (value: boolean) => void;
  handleUpdateClusterName: (source: string) => void;
}

export function ClusterNameEditor({
  cluster,
  clusterConf,
  newClusterName,
  setNewClusterName,
  clusterErrorDialogMessage,
  clusterErrorDialogOpen,
  setClusterErrorDialogOpen,
  handleUpdateClusterName,
}: ClusterNameEditorProps) {
  const { t } = useTranslation(['translation']);
  const [customNameInUse, setCustomNameInUse] = React.useState(false);

  const clusterInfo = (clusterConf && clusterConf[cluster || '']) || null;
  const source = clusterInfo?.meta_data?.source;
  const originalName = clusterInfo?.meta_data?.originalName;
  const displayName = originalName || (clusterInfo ? clusterInfo.name : '');

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
        {displayOriginalName && currentName !== displayOriginalName && (
          <Typography variant="body2" color="textSecondary">
            {t('translation|Original name: {{ displayName }}', {
              displayName: displayName,
            })}
          </Typography>
        )}
      </>
    );
  }

  const isValidCurrentName = isValidClusterNameFormat(newClusterName);

  return (
    <NameValueTable
      rows={[
        {
          name: <ClusterName />,
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
              InputProps={{
                endAdornment: (
                  <Box pt={2} textAlign="right">
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
