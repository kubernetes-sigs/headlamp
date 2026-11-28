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
import { useClustersServingStatus } from '../../lib/k8s/resourceAvailability';
import ResourceClaimTemplate from '../../lib/k8s/resourceClaimTemplate';
import { EmptyStateActions } from '../common/Resource/EmptyStateActions';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ResourceClaimTemplateList() {
  const { t } = useTranslation(['glossary', 'translation']);
  // List only from clusters that serve the API, and offer Create once every selected
  // cluster has answered, as a later answer can change which cluster is the first.
  const { clusters: servingClusters, isChecking } = useClustersServingStatus(ResourceClaimTemplate);

  return (
    <ResourceListView
      title={t('glossary|Resource Claim Templates')}
      resourceClass={ResourceClaimTemplate}
      clusters={servingClusters}
      headerProps={
        servingClusters === undefined || isChecking ? { titleSideActions: [] } : undefined
      }
      emptyActions={servingClusters === undefined || isChecking ? <EmptyStateActions /> : undefined}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'requests',
          label: t('translation|Requests'),
          gridTemplate: 'min-content',
          getValue: item => item.requests.length,
        },
        {
          id: 'deviceClasses',
          label: t('glossary|Device Classes'),
          getValue: item => item.requestedClasses.join(', '),
        },
        'age',
      ]}
    />
  );
}
