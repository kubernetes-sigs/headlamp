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
import APIService from '../../lib/k8s/apiService';
import { StatusLabel } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';

export default function APIServiceList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|API Services')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={APIService}
      columns={[
        'name',
        {
          id: 'service',
          label: t('glossary|Service'),
          getValue: apiService => {
            const service = apiService.spec?.service;
            if (!service) {
              return t('translation|None');
            }
            const base = `${service.namespace}/${service.name}`;
            return service.port !== undefined && service.port !== null
              ? `${base}:${service.port}`
              : base;
          },
        },
        {
          id: 'available',
          label: t('glossary|Available//context:replicas'),
          getValue: apiService =>
            apiService.isAvailable === 'True' ? t('translation|Yes') : t('translation|No'),
          render: apiService => (
            <StatusLabel status={apiService.isAvailable === 'True' ? 'success' : 'error'}>
              {apiService.isAvailable === 'True' ? t('translation|Yes') : t('translation|No')}
            </StatusLabel>
          ),
        },
        'age',
      ]}
    />
  );
}
