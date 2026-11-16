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
import type Pod from '../../lib/k8s/pod';
import type { PodClaimReference } from '../../lib/k8s/pod';
import Link from '../common/Link';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export interface PodResourceClaimsSectionProps {
  pod: Pod;
}

export default function PodResourceClaimsSection({ pod }: PodResourceClaimsSectionProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const claims = pod.resourceClaims;

  if (claims.length === 0) {
    return null;
  }

  function sourceText(claim: PodClaimReference) {
    switch (claim.source) {
      case 'claim':
        return t('translation|Claim');
      case 'template':
        return (
          <Link
            routeName="resourceClaimTemplate"
            params={{ namespace: pod.getNamespace(), name: claim.templateName ?? '' }}
            activeCluster={pod.cluster}
          >
            {t('translation|Template: {{ name }}', { name: claim.templateName ?? '' })}
          </Link>
        );
      case 'extendedResource':
        return t('translation|Extended resource');
    }
  }

  return (
    <SectionBox title={t('glossary|Resource Claims')}>
      <SimpleTable
        data={claims}
        columns={[
          {
            label: t('translation|Name'),
            getter: claim =>
              claim.claimName ? (
                <Link
                  routeName="resourceClaim"
                  params={{ namespace: pod.getNamespace(), name: claim.claimName }}
                  activeCluster={pod.cluster}
                >
                  {claim.claimName}
                </Link>
              ) : (
                t('translation|Not generated yet')
              ),
          },
          {
            label: t('translation|Source'),
            getter: sourceText,
          },
          {
            label: t('translation|Containers'),
            getter: claim => claim.containers.join(', '),
          },
        ]}
      />
    </SectionBox>
  );
}
