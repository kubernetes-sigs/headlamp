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

import { useTranslation } from 'react-i18next';
import DeviceTaintRule from '../../lib/k8s/deviceTaintRule';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import ResourceListView from '../common/Resource/ResourceListView';
import DeviceTaintRuleStatus, { getDeviceTaintRuleStatusText } from './DeviceTaintRuleStatus';

export default function DeviceTaintRuleList() {
  const { t } = useTranslation(['translation']);
  const servingClusters = useClustersServing(DeviceTaintRule);

  return (
    <ResourceListView
      title={t('translation|Device Taint Rules')}
      resourceClass={DeviceTaintRule}
      clusters={servingClusters}
      headerProps={{ titleSideActions: [] }}
      columns={[
        'name',
        'cluster',
        {
          id: 'selector',
          label: t('translation|Selectors'),
          getValue: item =>
            item.matchesAllDevices
              ? t('translation|All devices')
              : item.selectorEntries.map(entry => `${entry.field}: ${entry.value}`).join(', '),
        },
        {
          id: 'effect',
          label: t('translation|Effect'),
          getValue: item => item.taint.effect,
        },
        {
          id: 'taint',
          label: t('translation|Taint'),
          getValue: item => [item.taint.key, item.taint.value].filter(Boolean).join('='),
        },
        {
          id: 'status',
          label: t('translation|Status'),
          getValue: item => getDeviceTaintRuleStatusText(item, t),
          render: item => <DeviceTaintRuleStatus rule={item} />,
        },
        'age',
      ]}
    />
  );
}
