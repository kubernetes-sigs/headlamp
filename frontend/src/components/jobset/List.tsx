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
import JobSet from '../../lib/k8s/jobSet';
import ResourceListView from '../common/Resource/ResourceListView';

// Explicit priority to make the rendered condition stable and meaningful.
const conditionPriority = ['Failed', 'Completed', 'Suspended', 'StartupPolicyCompleted'];

function getJobSetCondition(jobSet: JobSet): string {
  const conditions = jobSet.status?.conditions;
  if (!conditions) return '-';

  const trueConditions = conditions.filter(c => c.status === 'True');
  if (trueConditions.length === 0) {
    return '-';
  }

  let selected = trueConditions[0];
  let bestPriorityIndex = conditionPriority.length;

  for (const cond of trueConditions) {
    const idx = conditionPriority.indexOf(cond.type);
    if (idx !== -1 && idx < bestPriorityIndex) {
      bestPriorityIndex = idx;
      selected = cond;
    }
  }

  return selected.type ?? '-';
}

export default function JobSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Job Sets')}
      resourceClass={JobSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          gridTemplate: 'min-content',
          getValue: (jobSet: JobSet) => getJobSetCondition(jobSet),
        },
        'age',
      ]}
      reflectInURL="jobsets"
      id="headlamp-jobsets"
    />
  );
}
