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
import PodGroup from '../../lib/k8s/podGroup';
import { StatusLabel } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';

/** Shows whether the group met its scheduling requirement, from the PodGroupScheduled condition. */
function SchedulingStatus({ podGroup }: { podGroup: PodGroup }) {
  const { t } = useTranslation(['translation']);
  const condition = podGroup.schedulingCondition;

  if (!condition) {
    return <span>{t('translation|Unknown')}</span>;
  }

  const scheduled = condition.status === 'True';
  return (
    <StatusLabel status={scheduled ? 'success' : 'warning'}>
      {condition.reason || (scheduled ? t('translation|Scheduled') : t('translation|Pending'))}
    </StatusLabel>
  );
}

export default function PodGroupList() {
  const { t } = useTranslation(['glossary', 'translation']);

  const headerPropsNoCreateButton = { titleSideActions: [] };

  return (
    <ResourceListView
      title={t('glossary|Pod Groups')}
      headerProps={headerPropsNoCreateButton}
      resourceClass={PodGroup}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'policy',
          label: t('translation|Policy'),
          gridTemplate: 'min-content',
          getValue: item => item.policyKind ?? '',
        },
        {
          id: 'minCount',
          label: t('translation|Min Count'),
          gridTemplate: 'min-content',
          getValue: item => item.minCount ?? null,
        },
        {
          id: 'workload',
          label: t('glossary|Workload'),
          gridTemplate: 'min-content',
          getValue: item => item.workloadName ?? '',
        },
        {
          id: 'status',
          label: t('translation|Status'),
          gridTemplate: 'min-content',
          getValue: item => item.schedulingCondition?.reason ?? '',
          render: item => <SchedulingStatus podGroup={item} />,
        },
        'age',
      ]}
    />
  );
}
