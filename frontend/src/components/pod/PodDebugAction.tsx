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
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import Pod from '../../lib/k8s/pod';
import { Activity } from '../activity/Activity';
import type { ActivityState } from '../activity/activitySlice';
import ActionButton from '../common/ActionButton';
import { AuthVisible } from '../common/Resource';
import { PodDebugTerminal } from './PodDebugTerminal';

/**
 * Props for PodDebugAction.
 *
 * @property {Pod | null} item - Pod to debug or null
 */
interface PodDebugActionProps {
  item: Pod | null;
}

/**
 * Checks if pod debugging is enabled for the cluster.
 * Defaults to true if not configured.
 *
 * @param cluster - Cluster name or null
 * @returns True if enabled or not configured, false otherwise
 */
function isPodDebugEnabled(cluster: string | null) {
  if (cluster === null) {
    return false;
  }
  const clusterSettings = loadClusterSettings(cluster);
  return clusterSettings.podDebugTerminal?.isEnabled ?? true;
}

/**
 * Action button for launching a pod debug terminal.
 *
 * Requires pod existence, enabled cluster settings, and patch/attach permissions.
 * Focuses existing session instead of creating duplicates.
 *
 * When clicked, if the pod has a single container, it auto-targets that container.
 * If multiple containers exist, shows a dialog to pick which container to target.
 *
 * @param props - Pod to debug
 * @returns ActionButton wrapped in auth guards, or null
 */
export function PodDebugAction(props: PodDebugActionProps) {
  const { item } = props;
  const { t } = useTranslation(['translation']);
  const activities = useSelector((state: { activity: ActivityState }) => state.activity.activities);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string>('');

  if (item === null) {
    return null;
  }

  const cluster = getCluster();
  const getActivityId = (target?: string) =>
    target
      ? `pod-debug-${item.metadata.uid}-target:${target}`
      : `pod-debug-${item.metadata.uid}-no-target`;

  if (!isPodDebugEnabled(cluster)) {
    return null;
  }

  const containers = item.spec.containers || [];

  function launchDebugTerminal(targetContainer?: string) {
    const specificActivityId = getActivityId(targetContainer);
    if (specificActivityId in activities) {
      Activity.update(specificActivityId, { minimized: false });
      return;
    }

    Activity.launch({
      id: specificActivityId,
      location: 'full',
      title: t('translation|Debug: {{ itemName }}', { itemName: item!.metadata.name }),
      cluster: item!.cluster,
      icon: <Icon icon="mdi:bug" width="100%" height="100%" />,
      content: (
        <PodDebugTerminal
          key="pod-debug-terminal"
          item={item!}
          targetContainer={targetContainer}
          onClose={() => Activity.close(specificActivityId)}
        />
      ),
    });
  }

  function handleDebugClick() {
    // If only one regular container, auto-target it without showing dialog.
    // Init containers are not considered here since they are typically not
    // running application processes that users would want to debug.
    if (containers.length === 1) {
      launchDebugTerminal(containers[0].name);
      return;
    }

    // Multiple containers: show picker dialog
    setSelectedContainer(containers.length > 0 ? containers[0].name : '');
    setDialogOpen(true);
  }

  function handleStartDebug() {
    setDialogOpen(false);
    launchDebugTerminal(selectedContainer || undefined);
  }

  return (
    <AuthVisible item={item} authVerb="patch" subresource="ephemeralcontainers">
      <AuthVisible item={item} authVerb="get" subresource="attach">
        <ActionButton
          description={t('translation|Debug Pod')}
          icon="mdi:bug"
          onClick={handleDebugClick}
        />
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>
            {t('translation|Debug Pod: {{ name }}', { name: item.metadata.name })}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t(
                'translation|Select a target container to share its process namespace, or choose "(None)" to run without targeting.'
              )}
            </Typography>
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel id="debug-target-container-label">
                {t('translation|Target Container')}
              </InputLabel>
              <Select
                labelId="debug-target-container-label"
                id="debug-target-container-select"
                value={selectedContainer}
                label={t('translation|Target Container')}
                displayEmpty
                renderValue={value => (value === '' ? t('translation|(None)') : (value as string))}
                onChange={e => setSelectedContainer(e.target.value as string)}
              >
                <MenuItem value="">{t('translation|(None)')}</MenuItem>
                {containers.map(c => (
                  <MenuItem key={c.name} value={c.name}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>{t('translation|Cancel')}</Button>
            <Button variant="contained" onClick={handleStartDebug}>
              {t('translation|Start Debug')}
            </Button>
          </DialogActions>
        </Dialog>
      </AuthVisible>
    </AuthVisible>
  );
}
