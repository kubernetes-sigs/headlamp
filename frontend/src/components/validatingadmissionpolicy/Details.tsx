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
import { useParams } from 'react-router';
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
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'validatingadmissionpolicy-matchconstraints',
            section: () => {
              if (!item.spec?.matchConstraints) {
                return <></>;
              }
              const matchConstraints = item.spec.matchConstraints;
              return (
                <SectionBox title={t('Match Constraints')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('Match Policy'),
                        value: matchConstraints.matchPolicy,
                      },
                      {
                        name: t('Namespace Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={matchConstraints.namespaceSelector?.matchLabels}
                            matchExpressions={matchConstraints.namespaceSelector?.matchExpressions}
                          />
                        ),
                      },
                      {
                        name: t('Object Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={matchConstraints.objectSelector?.matchLabels}
                            matchExpressions={matchConstraints.objectSelector?.matchExpressions}
                          />
                        ),
                      },
                      {
                        name: t('Resource Rules'),
                        value: (
                          <SimpleTable
                            data={matchConstraints.resourceRules || []}
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
                                label: t('Operations'),
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
                        ),
                      },
                      {
                        name: t('Exclude Resource Rules'),
                        value: (
                          <SimpleTable
                            data={matchConstraints.excludeResourceRules || []}
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
                                label: t('Operations'),
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
                        ),
                      },
                    ]}
                  />
                </SectionBox>
              );
            },
          },
          {
            id: 'validatingadmissionpolicy-matchconditions',
            section: () => {
              if (!item.spec?.matchConditions || item.spec.matchConditions.length === 0) {
                return <></>;
              }
              return (
                <SectionBox title={t('Match Conditions')}>
                  <SimpleTable
                    data={item.spec.matchConditions}
                    columns={[
                      {
                        label: t('Name'),
                        getter: condition => condition.name,
                      },
                      {
                        label: t('Expression'),
                        getter: condition => condition.expression,
                      },
                    ]}
                  />
                </SectionBox>
              );
            },
          },
          {
            id: 'validatingadmissionpolicy-variables',
            section: () => {
              if (!item.spec?.variables || item.spec.variables.length === 0) {
                return <></>;
              }
              return (
                <SectionBox title={t('Variables')}>
                  <SimpleTable
                    data={item.spec.variables}
                    columns={[
                      {
                        label: t('Name'),
                        getter: variable => variable.name,
                      },
                      {
                        label: t('Expression'),
                        getter: variable => variable.expression,
                      },
                    ]}
                  />
                </SectionBox>
              );
            },
          },
          {
            id: 'validatingadmissionpolicy-validations',
            section: () => {
              if (!item.spec?.validations || item.spec.validations.length === 0) {
                return <></>;
              }
              return (
                <SectionBox title={t('Validations')}>
                  <SimpleTable
                    data={item.spec.validations}
                    columns={[
                      {
                        label: t('Expression'),
                        getter: validation => validation.expression,
                      },
                      {
                        label: t('Message'),
                        getter: validation => validation.message,
                      },
                      {
                        label: t('Reason'),
                        getter: validation => validation.reason,
                      },
                    ]}
                  />
                </SectionBox>
              );
            },
          },
          {
            id: 'validatingadmissionpolicy-auditannotations',
            section: () => {
              if (!item.spec?.auditAnnotations || item.spec.auditAnnotations.length === 0) {
                return <></>;
              }
              return (
                <SectionBox title={t('Audit Annotations')}>
                  <SimpleTable
                    data={item.spec.auditAnnotations}
                    columns={[
                      {
                        label: t('Key'),
                        getter: annotation => annotation.key,
                      },
                      {
                        label: t('Value Expression'),
                        getter: annotation => annotation.valueExpression,
                      },
                    ]}
                  />
                </SectionBox>
              );
            },
          },
        ]
      }
    />
  );
}
