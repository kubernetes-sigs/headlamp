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
import { useParams } from 'react-router-dom';
import { LimitRange } from '../../lib/k8s/limitRange';
import Namespace from '../../lib/k8s/namespace';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import { StatusLabel } from '../common/Label';
import { ConditionsSection, DetailsGrid, OwnedPodsSection } from '../common/Resource';
import DetailsViewSection from '../DetailsViewSection';
import { LimitRangeRenderer } from '../limitRange/List';
import { ResourceQuotaRenderer } from '../resourceQuota/List';

export default function NamespaceDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function makeStatusLabel(namespace: Namespace | null) {
    const status = namespace?.status.phase;
    return <StatusLabel status={status === 'Active' ? 'success' : 'error'}>{status}</StatusLabel>;
  }

  return (
    <DetailsGrid
      resourceType={Namespace}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: makeStatusLabel(item),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.namespace-conditions',
            section: item?.status?.conditions && <ConditionsSection resource={item} />,
          },
          {
            id: 'headlamp.namespace-owned-resourcequotas',
            section: <NamespacedResourceQuotasSection resource={item} />,
          },
          {
            id: 'headlamp.namespace-owned-limitranges',
            section: <NamespacedLimitRangesSection resource={item} />,
          },
          {
            id: 'headlamp.namespace-owned-pods',
            section: <OwnedPodsSection hideColumns={['namespace']} resource={item} noSearch />,
          },
          {
            id: 'headlamp.namespace-details-view',
            section: <DetailsViewSection resource={item} />,
          },
        ]
      }
    />
  );
}

export interface NamespacedLimitRangesSectionProps {
  resource: Namespace;
}

export function NamespacedLimitRangesSection(props: NamespacedLimitRangesSectionProps) {
  const { resource } = props;

  const { items: limitRanges, errors } = LimitRange.useList({
    namespace: resource.metadata.name,
    cluster: resource.cluster,
  });

  return (
    <LimitRangeRenderer
      hideColumns={['namespace']}
      limitRanges={limitRanges}
      errors={errors}
      noNamespaceFilter
    />
  );
}

export interface NamespacedResourceQuotasSectionProps {
  resource: Namespace;
}

export function NamespacedResourceQuotasSection(props: NamespacedResourceQuotasSectionProps) {
  const { resource } = props;

  const { items: resourceQuotas, errors } = ResourceQuota.useList({
    namespace: resource.metadata.name,
    cluster: resource.cluster,
  });

  return (
    <ResourceQuotaRenderer
      hideColumns={['namespace']}
      resourceQuotas={resourceQuotas}
      errors={errors}
      noNamespaceFilter
    />
  );
}
