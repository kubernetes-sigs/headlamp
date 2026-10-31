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
import ClusterTrustBundle from '../../lib/k8s/clusterTrustBundle';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ClusterTrustBundleList() {
  const { t } = useTranslation(['glossary', 'translation']);
  // Only some of the selected clusters may serve the API, and asking the others
  // would report errors for clusters that simply do not have the feature. Until
  // the probe has answered the list stays on every selected cluster, and offers no
  // create action, since that could only target the first of them.
  const servingClusters = useClustersServing(ClusterTrustBundle);

  return (
    <ResourceListView
      title={t('glossary|Cluster Trust Bundles')}
      resourceClass={ClusterTrustBundle}
      clusters={servingClusters}
      headerProps={servingClusters === undefined ? { titleSideActions: [] } : undefined}
      columns={[
        'name',
        'cluster',
        {
          id: 'signerName',
          label: t('translation|Signer'),
          getValue: item => item.signerName,
          render: item => item.signerName || t('translation|None'),
        },
        {
          id: 'certificateCount',
          label: t('translation|Certificates'),
          gridTemplate: 'min-content',
          getValue: item => item.certificateCount,
        },
        'age',
      ]}
    />
  );
}
