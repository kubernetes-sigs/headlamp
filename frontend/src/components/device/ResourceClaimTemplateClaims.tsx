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
import Pod from '../../lib/k8s/pod';
import ResourceClaim from '../../lib/k8s/resourceClaim';
import type ResourceClaimTemplate from '../../lib/k8s/resourceClaimTemplate';
import Link from '../common/Link';
import SimpleTable from '../common/SimpleTable';
import ResourceClaimStatus from './ResourceClaimStatus';
import { getClaimsFromTemplate, type TemplateClaim } from './templateClaims';

export interface ResourceClaimTemplateClaimsProps {
  template: ResourceClaimTemplate;
}

export default function ResourceClaimTemplateClaims({
  template,
}: ResourceClaimTemplateClaimsProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const listOptions = { namespace: template.getNamespace(), cluster: template.cluster };
  const pods = Pod.useList(listOptions);
  const claims = ResourceClaim.useList(listOptions);

  const rows = getClaimsFromTemplate(template.getName(), pods.items ?? []);
  const hasError = pods.isError && rows.length === 0;
  const claimsByName = new Map((claims.items ?? []).map(claim => [claim.getName(), claim]));

  return (
    <SimpleTable
      data={pods.isLoading || hasError ? null : rows}
      errorMessage={
        hasError ? t('translation|Unable to list the Pods that use this template.') : undefined
      }
      emptyMessage={t('translation|No Pods use this template yet.')}
      columns={[
        {
          label: t('translation|Claim'),
          getter: (row: TemplateClaim) =>
            row.claimName ? (
              <Link
                routeName="resourceClaim"
                params={{ namespace: template.getNamespace(), name: row.claimName }}
                activeCluster={template.cluster}
              >
                {row.claimName}
              </Link>
            ) : (
              t('translation|Not generated yet')
            ),
        },
        {
          label: t('glossary|Pod'),
          getter: (row: TemplateClaim) => (
            <Link
              routeName="pod"
              params={{ namespace: template.getNamespace(), name: row.pod.getName() }}
              activeCluster={template.cluster}
            >
              {row.pod.getName()}
            </Link>
          ),
        },
        {
          label: t('translation|Status'),
          getter: (row: TemplateClaim) => {
            const claim = row.claimName ? claimsByName.get(row.claimName) : undefined;
            return claim ? <ResourceClaimStatus claim={claim} /> : '';
          },
        },
      ]}
    />
  );
}
