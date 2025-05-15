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
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { alpha } from '@mui/system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../../lib/k8s';
import ActionButton from '../ActionButton';
import EditorDialog from './EditorDialog';

interface CreateButtonProps {
  isNarrow?: boolean;
}

export default function CreateButton(props: CreateButtonProps) {
  const { isNarrow } = props;

  const [openDialog, setOpenDialog] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const { t } = useTranslation(['translation']);
  const clusters = useSelectedClusters();
  const [targetCluster, setTargetCluster] = React.useState(clusters[0] || '');

  // We want to avoid resetting the dialog state on close.
  const itemRef = React.useRef({});

  // When the clusters in the group change, we want to reset the target cluster
  // if it's not in the new list of clusters.
  React.useEffect(() => {
    if (clusters.length === 0) {
      setTargetCluster('');
    } else if (!clusters.includes(targetCluster)) {
      setTargetCluster(clusters[0]);
    }
  }, [clusters]);

  return (
    <React.Fragment>
      {isNarrow ? (
        <ActionButton
          description={t('translation|Create / Apply')}
          onClick={() => setOpenDialog(true)}
          icon="mdi:plus-box"
          width="48"
          iconButtonProps={{
            color: 'primary',
            sx: theme => ({
              color: theme.palette.sidebar.color,
            }),
          }}
        />
      ) : (
        <Button
          onClick={() => {
            setOpenDialog(true);
          }}
          startIcon={<InlineIcon icon="mdi:plus" />}
          color="secondary"
          size="large"
          sx={theme => ({
            background: theme.palette.sidebar.actionBackground,
            color: theme.palette.getContrastText(theme.palette.sidebar.actionBackground),
            ':hover': {
              background: alpha(theme.palette.sidebar.actionBackground, 0.6),
            },
          })}
        >
          {t('translation|Create')}
        </Button>
      )}
      <EditorDialog
        item={itemRef.current}
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        setOpen={setOpenDialog}
        saveLabel={t('translation|Apply')}
        errorMessage={errorMessage}
        onEditorChanged={() => setErrorMessage('')}
        title={t('translation|Create / Apply')}
        actions={
          clusters.length > 1
            ? [
                <FormControl>
                  <InputLabel id="edit-dialog-cluster-target">{t('glossary|Cluster')}</InputLabel>
                  <Select
                    labelId="edit-dialog-cluster-target"
                    id="edit-dialog-cluster-target-select"
                    value={targetCluster}
                    onChange={event => {
                      setTargetCluster(event.target.value as string);
                    }}
                  >
                    {clusters.map(cluster => (
                      <MenuItem key={cluster} value={cluster}>
                        {cluster}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>,
              ]
            : []
        }
      />
    </React.Fragment>
  );
}
