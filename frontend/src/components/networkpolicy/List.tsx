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
import { matchExpressionSimplifier, matchLabelsSimplifier } from '../../lib/k8s';
import NetworkPolicy from '../../lib/k8s/networkpolicy';
import { MatchExpressions } from '../common/Resource/MatchExpressions';
import ResourceListView from '../common/Resource/ResourceListView';

export function NetworkPolicyList() {
  const { t } = useTranslation(['glossary']);
  return (
    <ResourceListView
      title={t('Network Policies')}
      resourceClass={NetworkPolicy}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'type',
          gridTemplate: 'auto',
          label: t('translation|Type'),
          getValue: networkpolicy => {
            const isIngressAvailable =
              networkpolicy.jsonData.spec.ingress && networkpolicy.jsonData.spec.ingress.length > 0;
            const isEgressAvailable =
              networkpolicy.jsonData.spec.egress && networkpolicy.jsonData.spec.egress.length > 0;
            return isIngressAvailable && isEgressAvailable
              ? 'Ingress and Egress'
              : isIngressAvailable
              ? 'Ingress'
              : isEgressAvailable
              ? 'Egress'
              : 'None';
          },
        },
        {
          id: 'podSelector',
          gridTemplate: 'auto',
          label: t('Pod Selector'),
          getValue: networkpolicy => {
            const podSelector = networkpolicy.jsonData.spec.podSelector || {};
            const { matchLabels, matchExpressions } = podSelector;
            const labels = matchLabelsSimplifier(matchLabels, true);
            const expressions = matchExpressionSimplifier(matchExpressions);
            const parts = [
              ...(Array.isArray(labels) ? labels : []),
              ...(Array.isArray(expressions) ? expressions : []),
            ];
            return parts.join(', ');
          },
          render: networkpolicy => {
            const podSelector = networkpolicy.jsonData.spec.podSelector || {};
            const { matchLabels, matchExpressions } = podSelector;
            if (!matchLabels && !matchExpressions) {
              return null;
            }

            return (
              <MatchExpressions matchLabels={matchLabels} matchExpressions={matchExpressions} />
            );
          },
        },
        'age',
      ]}
    />
  );
}
