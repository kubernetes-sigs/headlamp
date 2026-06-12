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
import MutatingAdmissionPolicy from '../../lib/k8s/mutatingAdmissionPolicy';
import type { KubeRuleWithOperations } from '../../lib/k8s/mutatingWebhookConfiguration';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

function ruleRows(
  includeRules: KubeRuleWithOperations[] = [],
  excludeRules: KubeRuleWithOperations[] = []
) {
  return [
    ...includeRules.map(rule => ({ ...rule, ruleType: 'Include' })),
    ...excludeRules.map(rule => ({ ...rule, ruleType: 'Exclude' })),
  ];
}

export default function MutatingAdmissionPolicyDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={MutatingAdmissionPolicy}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('API Version'),
            value: item.jsonData.apiVersion,
          },
          {
            name: t('Failure Policy'),
            value: item.spec.failurePolicy,
          },
          {
            name: t('Reinvocation Policy'),
            value: item.spec.reinvocationPolicy,
          },
          {
            name: t('translation|Param Kind'),
            value: item.spec.paramKind
              ? `${item.spec.paramKind.apiVersion || ''} ${item.spec.paramKind.kind || ''}`.trim()
              : '-',
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.mutating-admission-policy-mutations',
            section: (
              <SectionBox title={t('translation|Mutations')}>
                <SimpleTable
                  data={item.spec.mutations || []}
                  columns={[
                    {
                      label: t('translation|Patch Type'),
                      getter: mutation => mutation.patchType,
                    },
                    {
                      label: t('translation|Expression'),
                      getter: mutation =>
                        mutation.applyConfiguration?.expression || mutation.jsonPatch?.expression,
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.mutating-admission-policy-match-constraints',
            section: (
              <SectionBox title={t('translation|Match Constraints')}>
                <SimpleTable
                  data={ruleRows(
                    item.spec.matchConstraints?.resourceRules,
                    item.spec.matchConstraints?.excludeResourceRules
                  )}
                  columns={[
                    {
                      label: t('translation|Rule Type'),
                      getter: rule => rule.ruleType,
                    },
                    {
                      label: t('API Groups'),
                      getter: rule => rule.apiGroups?.join(', '),
                    },
                    {
                      label: t('API Versions'),
                      getter: rule => rule.apiVersions?.join(', '),
                    },
                    {
                      label: t('translation|Operations'),
                      getter: rule => rule.operations?.join(', '),
                    },
                    {
                      label: t('Resources'),
                      getter: rule => rule.resources?.join(', '),
                    },
                    {
                      label: t('Scope'),
                      getter: rule => rule.scope,
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.mutating-admission-policy-match-conditions',
            section: (
              <SectionBox title={t('translation|Match Conditions')}>
                <SimpleTable
                  data={item.spec.matchConditions || []}
                  columns={[
                    {
                      label: t('translation|Name'),
                      getter: condition => condition.name,
                    },
                    {
                      label: t('translation|Expression'),
                      getter: condition => condition.expression,
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.mutating-admission-policy-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
