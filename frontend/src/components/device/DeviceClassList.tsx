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
import DeviceClass from '../../lib/k8s/deviceClass';
import ResourceListView from '../common/Resource/ResourceListView';

export default function DeviceClassList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Device Classes')}
      resourceClass={DeviceClass}
      columns={[
        'name',
        'cluster',
        {
          id: 'selectors',
          label: t('translation|Selectors'),
          gridTemplate: 'min-content',
          getValue: item =>
            item.matchesAllDevices
              ? t('translation|All devices')
              : item.selectorExpressions.length.toString(),
        },
        {
          id: 'drivers',
          label: t('glossary|Drivers'),
          getValue: item =>
            [...new Set(item.driverConfigs.map(config => config.driver))].join(', '),
        },
        {
          id: 'extendedResource',
          label: t('translation|Extended Resource'),
          getValue: item => item.extendedResourceName ?? '',
        },
        'age',
      ]}
    />
  );
}
