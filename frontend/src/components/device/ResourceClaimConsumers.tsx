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
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import type { ResourceClaimConsumerReference } from '../../lib/k8s/resourceClaim';
import Link from '../common/Link';
import SimpleTable from '../common/SimpleTable';

function isPod(consumer: ResourceClaimConsumerReference) {
  return !consumer.apiGroup && consumer.resource === 'pods';
}

export default function ResourceClaimConsumers({ claim }: { claim: ResourceClaim }) {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SimpleTable
      columns={[
        {
          label: t('translation|Resource'),
          getter: (consumer: ResourceClaimConsumerReference) =>
            consumer.apiGroup ? `${consumer.resource}.${consumer.apiGroup}` : consumer.resource,
        },
        {
          label: t('translation|Name'),
          getter: (consumer: ResourceClaimConsumerReference) =>
            isPod(consumer) ? (
              <Link
                routeName="pod"
                params={{ namespace: claim.getNamespace(), name: consumer.name }}
                activeCluster={claim.cluster}
              >
                {consumer.name}
              </Link>
            ) : (
              consumer.name
            ),
        },
      ]}
      data={claim.consumers}
      emptyMessage={t('translation|Nothing uses this claim yet.')}
    />
  );
}
