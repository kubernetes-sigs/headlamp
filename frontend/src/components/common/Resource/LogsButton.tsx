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
import { KubeObject } from '../../../lib/k8s/KubeObject';
import type { HeadlampEvent } from '../../../plugin/registry';
import { EventStatus, HeadlampEventType } from '../../../redux/headlampEventSlice';
import { Activity } from '../../activity/Activity';
import ActionButton from '../ActionButton';
import { isLoggableWorkload } from '../LogsViewer/isLoggableWorkload';
import { LogsViewer } from '../LogsViewer/LogsViewer';

export function launchWorkloadLogs(
  item: KubeObject,
  dispatchHeadlampEvent?: (event: HeadlampEvent) => void
) {
  if (!isLoggableWorkload(item)) return;

  Activity.launch({
    id: 'logs-' + item.metadata.uid,
    title: 'Logs: ' + item.metadata.name,
    icon: <Icon icon="mdi:file-document-box-outline" width="100%" height="100%" />,
    cluster: item.cluster,
    location: 'full',
    content: <LogsViewer item={item} />,
  });
  dispatchHeadlampEvent?.({
    type: HeadlampEventType.LOGS,
    data: {
      status: EventStatus.OPENED,
    },
  });
}

interface LogsButtonProps {
  /**
   * Kubernetes resource to show the logs for
   * Button is not displayed if the item is not a workload with logs
   * */
  item: KubeObject | null;
}

/* Show logs button for supported workload types */
export function LogsButton({ item }: LogsButtonProps) {
  const { t } = useTranslation();

  if (!item || !isLoggableWorkload(item)) return;

  return (
    <ActionButton
      icon="mdi:file-document-box-outline"
      onClick={() => launchWorkloadLogs(item)}
      description={t('translation|Show logs')}
    />
  );
}
