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
import BackendTLSPolicy from '../../lib/k8s/backendTLSPolicy';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function BackendTLSPolicyList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Backend TLS Policies')}
      resourceClass={BackendTLSPolicy}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'targetRefs',
          label: t('Targets'),
          getValue: (policy: BackendTLSPolicy) =>
            policy.targetRefs.map(ref => `${ref.kind} (${ref.name})`).join(', '),
          render: (policy: BackendTLSPolicy) => (
            <LabelListItem labels={policy.targetRefs.map(ref => `${ref.kind} (${ref.name})`)} />
          ),
        },
        {
          id: 'hostname',
          label: t('Hostname'),
          getValue: (policy: BackendTLSPolicy) => policy.validation.hostname,
          render: (policy: BackendTLSPolicy) => (
            <LabelListItem labels={[policy.validation.hostname]} />
          ),
        },
        'age',
      ]}
    />
  );
}
