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
import ValidatingAdmissionPolicy from '../../lib/k8s/validatingAdmissionPolicy';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ValidatingAdmissionPolicyList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('Validating Admission Policies')}
      resourceClass={ValidatingAdmissionPolicy}
      columns={[
        'name',
        'cluster',
        {
          id: 'failurePolicy',
          label: t('Failure Policy'),
          gridTemplate: 'min-content',
          getValue: policy => policy.spec?.failurePolicy || '',
        },
        {
          id: 'validations',
          label: t('Validations'),
          gridTemplate: 'min-content',
          getValue: policy => policy.spec?.validations?.length || 0,
        },
        'labels',
        'age',
      ]}
    />
  );
}
