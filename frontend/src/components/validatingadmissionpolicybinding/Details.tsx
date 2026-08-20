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
import ValidatingAdmissionPolicyBinding from '../../lib/k8s/validatingAdmissionPolicyBinding';
import Link from '../common/Link';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import { MatchExpressions } from '../common/Resource/MatchExpressions';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function ValidatingAdmissionPolicyBindingDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ValidatingAdmissionPolicyBinding}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Policy Name'),
            value: item.spec?.policyName,
            render: () =>
              item.spec?.policyName ? (
                <Link
                  routeName="validatingAdmissionPolicy"
                  params={{ name: item.spec.policyName }}
                  activeCluster={item.cluster}
                >
                  {item.spec.policyName}
                </Link>
              ) : (
                ''
              ),
          },
          {
            name: t('Validation Actions'),
            value: item.spec?.validationActions?.join(', '),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'validatingadmissionpolicybinding-matchresources',
            section: () => {
              if (!item.spec?.matchResources) {
                return <></>;
              }
              const matchResources = item.spec.matchResources;
              return (
                <SectionBox title={t('Match Resources')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('Match Policy'),
                        value: matchResources.matchPolicy,
                      },
                      {
                        name: t('Namespace Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={matchResources.namespaceSelector?.matchLabels}
                            matchExpressions={matchResources.namespaceSelector?.matchExpressions}
                          />
                        ),
                      },
                      {
                        name: t('Object Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={matchResources.objectSelector?.matchLabels}
                            matchExpressions={matchResources.objectSelector?.matchExpressions}
                          />
                        ),
                      },
                      {
                        name: t('Resource Rules'),
                        value: (
                          <SimpleTable
                            data={matchResources.resourceRules || []}
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
                                label: t('Resource Names'),
                                getter: rule => rule.resourceNames?.join(', '),
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
                            data={matchResources.excludeResourceRules || []}
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
                                label: t('Resource Names'),
                                getter: rule => rule.resourceNames?.join(', '),
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
            id: 'validatingadmissionpolicybinding-paramref',
            section: () => {
              if (!item.spec?.paramRef) {
                return <></>;
              }
              const paramRef = item.spec.paramRef;
              return (
                <SectionBox title={t('Parameter Reference')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('Name'),
                        value: paramRef.name,
                      },
                      {
                        name: t('Namespace'),
                        value: paramRef.namespace,
                      },
                      {
                        name: t('Parameter Not Found Action'),
                        value: paramRef.parameterNotFoundAction,
                      },
                      {
                        name: t('Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={paramRef.selector?.matchLabels}
                            matchExpressions={paramRef.selector?.matchExpressions}
                          />
                        ),
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
