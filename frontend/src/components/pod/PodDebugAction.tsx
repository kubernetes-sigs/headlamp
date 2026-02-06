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
 * @param props - Pod to debug
 * @returns ActionButton wrapped in auth guards, or null
 */
export function PodDebugAction(props: PodDebugActionProps) {
  const { item } = props;
  const { t } = useTranslation(['translation']);
  const activities = useSelector((state: { activity: ActivityState }) => state.activity.activities);

  if (item === null) {
    return null;
  }

  const cluster = getCluster();
  const activityId = 'pod-debug-' + item.metadata.uid;

  if (!isPodDebugEnabled(cluster)) {
    return null;
  }

  // Check if activity already exists to prevent duplicates
  const isActivityOpen = activityId in activities;

  return (
    <AuthVisible item={item} authVerb="patch" subresource="ephemeralcontainers">
      <AuthVisible item={item} authVerb="get" subresource="attach">
        <ActionButton
          description={t('translation|Debug Pod')}
          icon="mdi:bug"
          onClick={() => {
            if (isActivityOpen) {
              // Focus existing activity instead of creating a duplicate
              Activity.update(activityId, { minimized: false });
              return;
            }

            Activity.launch({
              id: activityId,
              location: 'full',
              title: t('translation|Debug: {{ itemName }}', { itemName: item.metadata.name }),
              cluster: item.cluster,
              icon: <Icon icon="mdi:bug" width="100%" height="100%" />,
              content: (
                <PodDebugTerminal
                  key="pod-debug-terminal"
                  item={item}
                  onClose={() => Activity.close(activityId)}
                />
              ),
            });
          }}
        />
      </AuthVisible>
    </AuthVisible>
  );
}
