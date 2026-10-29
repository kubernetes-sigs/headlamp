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
import CSIStorageCapacity from '../../lib/k8s/csiStorageCapacity';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';

export default function CSIStorageCapacityDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={CSIStorageCapacity}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Storage Class'),
            value: item.storageClassName ? (
              <Link
                routeName="storageClass"
                params={{ name: item.storageClassName }}
                activeCluster={item.cluster}
                tooltip
              >
                {item.storageClassName}
              </Link>
            ) : (
              '-'
            ),
          },
          {
            name: t('Capacity'),
            value: item.capacity ?? '-',
          },
          {
            name: t('Maximum Volume Size'),
            value: item.maximumVolumeSize,
            hide: !item.maximumVolumeSize,
          },
          {
            name: t('Node Topology'),
            value: Object.entries(item.nodeTopology?.matchLabels ?? {})
              .map(([key, value]) => `${key}=${value}`)
              .join(', '),
            hide: !item.nodeTopology?.matchLabels,
          },
        ]
      }
    />
  );
}
