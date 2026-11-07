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
import { getTopCondition } from '../../lib/k8s/conditions';
import DisaggregatedSet from '../../lib/k8s/disaggregatedSet';
import ResourceListView from '../common/Resource/ResourceListView';

const conditionPriority = ['UpdateInProgress', 'Progressing', 'Available'];

function getReadySlices(disaggregatedSet: DisaggregatedSet): string {
  return `${disaggregatedSet.getReadyReplicas()}/${disaggregatedSet.getDesiredReplicas()}`;
}

function getRoles(disaggregatedSet: DisaggregatedSet): string {
  const roles = disaggregatedSet.spec?.roles;
  if (!roles || roles.length === 0) {
    return '-';
  }
  return roles.map(r => r.name).join(', ');
}

export default function DisaggregatedSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Disaggregated Sets')}
      resourceClass={DisaggregatedSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'ready',
          label: t('translation|Ready'),
          disableFiltering: true,
          gridTemplate: 'min-content',
          getValue: (disaggregatedSet: DisaggregatedSet) => getReadySlices(disaggregatedSet),
        },
        {
          id: 'roles',
          label: t('translation|Roles'),
          gridTemplate: 'auto',
          getValue: (disaggregatedSet: DisaggregatedSet) => getRoles(disaggregatedSet),
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          gridTemplate: 'min-content',
          getValue: (disaggregatedSet: DisaggregatedSet) =>
            getTopCondition(disaggregatedSet.status?.conditions, conditionPriority) ?? '-',
        },
        'age',
      ]}
      reflectInURL="disaggregatedsets"
      id="headlamp-disaggregatedsets"
    />
  );
}
