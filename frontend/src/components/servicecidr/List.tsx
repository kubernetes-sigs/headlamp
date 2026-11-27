/*
 * Copyright 2026 The Kubernetes Authors
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
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import ServiceCIDR from '../../lib/k8s/serviceCIDR';
import Loader from '../common/Loader';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';

export default function ServiceCIDRList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const clusters = useClustersServing(ServiceCIDR);
  const title = t('Service CIDRs');

  if (!clusters) {
    return (
      <SectionBox title={title}>
        <Loader title={t('translation|Loading...')} />
      </SectionBox>
    );
  }

  return (
    <ResourceListView
      title={title}
      resourceClass={ServiceCIDR}
      clusters={clusters}
      columns={[
        'name',
        'cluster',
        {
          id: 'cidrs',
          label: t('CIDRs'),
          getValue: item => item.cidrs.join(', ') || '-',
        },
        {
          id: 'ready',
          label: t('Ready'),
          getValue: item => item.readyCondition?.status ?? t('translation|Unknown'),
          filterVariant: 'multi-select',
        },
        'age',
      ]}
    />
  );
}
