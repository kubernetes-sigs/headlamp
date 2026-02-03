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
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import { KubeObjectClass } from '../../lib/k8s/cluster';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import { AuthVisible } from '../common/Resource';
import { EditorDialog } from '../common/Resource';

export interface CreateResourceButtonProps {
  resourceClass: KubeObjectClass;
  resourceName?: string;
}

export function CreateResourceButton(props: CreateResourceButtonProps) {
  const { resourceClass, resourceName } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const [errorMessage, setErrorMessage] = React.useState('');
  const clusters = useSelectedClusters();
  const [isClusterChooserOpen, setIsClusterChooserOpen] = React.useState(false);
  const [targetCluster, setTargetCluster] = React.useState<string | undefined>(clusters[0]);
  const canCreate = clusters.length > 0;

  const baseObject = resourceClass.getBaseObject();
  const name = resourceName ?? baseObject.kind;
  const activityId = 'create-resource-' + resourceClass.apiName;

  // Keep targetCluster in sync with current selection.
  React.useEffect(() => {
    setTargetCluster(currentTargetCluster =>
      currentTargetCluster && clusters.includes(currentTargetCluster)
        ? currentTargetCluster
        : clusters[0]
    );
  }, [clusters]);

  const launchCreateActivity = React.useCallback(
    (clusterName: string) => {
      Activity.launch({
        id: activityId,
        title: t('translation|Create {{ name }}', { name }),
        location: 'full',
        cluster: clusterName,
        icon: <Icon icon="mdi:plus-circle" />,
        content: (
          <EditorDialog
            noDialog
            // Pass cluster to ensure Apply targets the chosen cluster.
            item={{ ...baseObject, cluster: clusterName }}
            open
            setOpen={() => {}}
            onClose={() => Activity.close(activityId)}
            saveLabel={t('translation|Apply')}
            errorMessage={errorMessage}
            onEditorChanged={() => setErrorMessage('')}
            title={t('translation|Create {{ name }}', { name })}
            aria-label={t('translation|Create {{ name }}', { name })}
          />
        ),
      });
    },
    [activityId, baseObject, errorMessage, name, t]
  );

  if (!canCreate) return null;

  return (
    <AuthVisible item={resourceClass} authVerb="create">
      <ActionButton
        color="primary"
        description={t('translation|Create {{ name }}', { name })}
        icon={'mdi:plus-circle'}
        longDescription={t('translation|Choose a cluster')}
        onClick={() => {
          if (clusters.length > 1) {
            setIsClusterChooserOpen(true);
            return;
          }
          // clusters.length > 0 is guaranteed by canCreate.
          launchCreateActivity(clusters[0]!);
        }}
      />

      <Dialog
        open={isClusterChooserOpen}
        onClose={() => setIsClusterChooserOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('translation|Choose a cluster')}</DialogTitle>
        <DialogContent>
          <FormControl variant="outlined" size="small" fullWidth margin="dense">
            <InputLabel id="create-resource-target-cluster-label">
              {t('glossary|Cluster')}
            </InputLabel>
            <Select
              labelId="create-resource-target-cluster-label"
              id="create-resource-target-cluster-select"
              value={targetCluster ?? ''}
              label={t('glossary|Cluster')}
              onChange={event => {
                const value = event.target.value as string;
                setTargetCluster(value || undefined);
              }}
            >
              {clusters.map(cluster => (
                <MenuItem key={cluster} value={cluster}>
                  {cluster}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            color="secondary"
            variant="contained"
            onClick={() => setIsClusterChooserOpen(false)}
          >
            {t('translation|Cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setIsClusterChooserOpen(false);
              if (!targetCluster) {
                return;
              }
              launchCreateActivity(targetCluster);
            }}
            disabled={!targetCluster}
          >
            {t('translation|Next')}
          </Button>
        </DialogActions>
      </Dialog>
    </AuthVisible>
  );
}
