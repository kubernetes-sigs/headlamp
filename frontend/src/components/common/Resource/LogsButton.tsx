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
import React from 'react';
import { useTranslation } from 'react-i18next';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import type Pod from '../../../lib/k8s/pod';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import type StatefulSet from '../../../lib/k8s/statefulSet';
import { Activity } from '../../activity/Activity';
import ActionButton from '../ActionButton';
import { LogsViewer } from '../LogsViewer/LogsViewer';

// Component props interface
interface LogsButtonProps {
  item: KubeObject | null;
}

// Styled component for consistent padding in form controls

export function LogsButton({ item }: LogsButtonProps) {
  const { t } = useTranslation();

  const onClick = () => {
    if (!item) return;
    Activity.launch({
      id: 'logs-' + item.metadata.uid,
      title: 'Logs: ' + item.metadata.name,
      icon: <Icon icon="mdi:file-document-box-outline" width="100%" height="100%" />,
      cluster: item.cluster,
      location: 'full',
      content: (
        <LogsViewer item={item as Pod | Deployment | ReplicaSet | DaemonSet | StatefulSet} />
      ),
    });
  };

  return (
    <>
      {/* Show logs button for supported workload types */}
      {(item instanceof Deployment || item instanceof ReplicaSet || item instanceof DaemonSet) && (
        <ActionButton
          icon="mdi:file-document-box-outline"
          onClick={onClick}
          description={t('translation|Show logs')}
        />
      )}
    </>
  );
}
