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
import ValidatingAdmissionPolicy from '../../lib/k8s/validatingAdmissionPolicy';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import { MatchExpressions } from '../common/Resource/MatchExpressions';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function ValidatingAdmissionPolicyDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ValidatingAdmissionPolicy}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Failure Policy'),
            value: item.spec?.failurePolicy,
          },
          {
            name: t('Validations'),
            value: item.spec?.validations?.length || 0,
          },
          {
            name: t('Match Conditions'),
            value: item.spec?.matchConditions?.length || 0,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.validations',
            section: () =>
              item.spec?.validations && item.spec.validations.length > 0 ? (
                <SectionBox title={t('Validations')}>
                  <SimpleTable
                    data={item.spec.validations}
                    columns={[
                      {
                        label: t('Expression'),
                        getter: v => v.expression,
                      },
                      {
                        label: t('translation|Message'),
                        getter: v => v.message || v.messageExpression || '',
                      },
                      {
                        label: t('translation|Reason'),
                        getter: v => v.reason || '',
                      },
                    ]}
                  />
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.match-constraints',
            section: () =>
              item.spec?.matchConstraints ? (
                <SectionBox title={t('Match Constraints')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('Match Policy'),
                        value: item.spec.matchConstraints.matchPolicy,
                        hide: !item.spec.matchConstraints.matchPolicy,
                      },
                      {
                        name: t('Namespace Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={item.spec.matchConstraints.namespaceSelector?.matchLabels}
                            matchExpressions={
                              item.spec.matchConstraints.namespaceSelector?.matchExpressions
                            }
                          />
                        ),
                        hide:
                          !item.spec.matchConstraints.namespaceSelector?.matchLabels &&
                          !item.spec.matchConstraints.namespaceSelector?.matchExpressions,
                      },
                      {
                        name: t('Object Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={item.spec.matchConstraints.objectSelector?.matchLabels}
                            matchExpressions={
                              item.spec.matchConstraints.objectSelector?.matchExpressions
                            }
                          />
                        ),
                        hide:
                          !item.spec.matchConstraints.objectSelector?.matchLabels &&
                          !item.spec.matchConstraints.objectSelector?.matchExpressions,
                      },
                    ]}
                  />
                  {item.spec.matchConstraints.resourceRules &&
                    item.spec.matchConstraints.resourceRules.length > 0 && (
                      <SimpleTable
                        data={item.spec.matchConstraints.resourceRules}
                        columns={[
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
                            getter: rule => rule.scope || '',
                          },
                        ]}
                      />
                    )}
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.match-conditions',
            section: () =>
              item.spec?.matchConditions && item.spec.matchConditions.length > 0 ? (
                <SectionBox title={t('Match Conditions')}>
                  <SimpleTable
                    data={item.spec.matchConditions}
                    columns={[
                      {
                        label: t('translation|Name'),
                        getter: c => c.name,
                      },
                      {
                        label: t('Expression'),
                        getter: c => c.expression,
                      },
                    ]}
                  />
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.audit-annotations',
            section: () =>
              item.spec?.auditAnnotations && item.spec.auditAnnotations.length > 0 ? (
                <SectionBox title={t('Audit Annotations')}>
                  <SimpleTable
                    data={item.spec.auditAnnotations}
                    columns={[
                      {
                        label: t('translation|Key'),
                        getter: a => a.key,
                      },
                      {
                        label: t('Value Expression'),
                        getter: a => a.valueExpression,
                      },
                    ]}
                  />
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.variables',
            section: () =>
              item.spec?.variables && item.spec.variables.length > 0 ? (
                <SectionBox title={t('Variables')}>
                  <SimpleTable
                    data={item.spec.variables}
                    columns={[
                      {
                        label: t('translation|Name'),
                        getter: v => v.name,
                      },
                      {
                        label: t('Expression'),
                        getter: v => v.expression,
                      },
                    ]}
                  />
                </SectionBox>
              ) : null,
          },
        ]
      }
    />
  );
}
