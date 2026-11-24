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
import MutatingAdmissionPolicyBinding from '../../lib/k8s/mutatingAdmissionPolicyBinding';
import type { KubeRuleWithOperations } from '../../lib/k8s/mutatingWebhookConfiguration';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

type ParamRef = NonNullable<
  InstanceType<typeof MutatingAdmissionPolicyBinding>['spec']['paramRef']
>;

function formatSelector(selector: ParamRef['selector']) {
  if (!selector) {
    return '-';
  }

  const labels = Object.entries(selector.matchLabels || {}).map(
    ([key, value]) => `${key}=${value}`
  );
  const expressions = (selector.matchExpressions || []).map(expression =>
    [expression.key, expression.operator, expression.values?.join(', ')].filter(Boolean).join(' ')
  );

  return [...labels, ...expressions].join(', ') || '-';
}

function ruleRows(
  includeRules: KubeRuleWithOperations[] = [],
  excludeRules: KubeRuleWithOperations[] = []
) {
  return [
    ...includeRules.map(rule => ({ ...rule, ruleType: 'include' })),
    ...excludeRules.map(rule => ({ ...rule, ruleType: 'exclude' })),
  ];
}

export default function MutatingAdmissionPolicyBindingDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={MutatingAdmissionPolicyBinding}
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
            name: t('translation|Policy Name'),
            value: item.spec.policyName,
          },
          {
            name: t('translation|Param Ref'),
            value: item.spec.paramRef?.name || '-',
          },
          {
            name: t('translation|Param Namespace'),
            value: item.spec.paramRef?.namespace || '-',
          },
          {
            name: t('translation|Param Selector'),
            value: formatSelector(item.spec.paramRef?.selector),
          },
          {
            name: t('translation|Parameter Not Found Action'),
            value: item.spec.paramRef?.parameterNotFoundAction || '-',
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.mutating-admission-policy-binding-match-resources',
            section: (
              <SectionBox title={t('translation|Match Resources')}>
                <SimpleTable
                  data={ruleRows(
                    item.spec.matchResources?.resourceRules,
                    item.spec.matchResources?.excludeResourceRules
                  )}
                  columns={[
                    {
                      label: t('translation|Rule Type'),
                      getter: rule =>
                        rule.ruleType === 'include'
                          ? t('translation|Include')
                          : t('translation|Exclude'),
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
        ]
      }
    />
  );
}
