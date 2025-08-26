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
import BackendTrafficPolicy from '../../lib/k8s/backendTrafficPolicy';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function BackendTrafficPolicyList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Backend Traffic Policies')}
      resourceClass={BackendTrafficPolicy}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'targetRefs',
          label: t('Targets'),
          getValue: (policy: BackendTrafficPolicy) =>
            policy.targetRefs.map(ref => `${ref.kind} (${ref.name})`).join(', '),
          render: (policy: BackendTrafficPolicy) => (
            <LabelListItem labels={policy.targetRefs.map(ref => `${ref.kind} (${ref.name})`)} />
          ),
        },
        {
          id: 'retryConstraint',
          label: t('Retry Constraint'),
          getValue: (policy: BackendTrafficPolicy) => {
            const budget = policy.retryConstraint?.budget;
            return budget ? `Retry ${budget.percent ?? 20}% per ${budget.interval ?? '10s'}` : '—';
          },
          render: (policy: BackendTrafficPolicy) => {
            const budget = policy.retryConstraint?.budget;
            const label = budget ? `Retry ${budget.percent}% per ${budget.interval}` : '—';
            return <LabelListItem labels={[label]} />;
          },
        },
        'age',
      ]}
    />
  );
}
