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
            value: item.spec?.policyName ? (
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
            value: item.spec?.validationActions?.join(', ') || '',
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.param-ref',
            section: () =>
              item.spec?.paramRef ? (
                <SectionBox title={t('Param Ref')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('translation|Name'),
                        value: item.spec.paramRef?.name,
                        hide: !item.spec.paramRef?.name,
                      },
                      {
                        name: t('translation|Namespace'),
                        value: item.spec.paramRef?.namespace,
                        hide: !item.spec.paramRef?.namespace,
                      },
                      {
                        name: t('Parameter Not Found Action'),
                        value: item.spec.paramRef?.parameterNotFoundAction,
                        hide: !item.spec.paramRef?.parameterNotFoundAction,
                      },
                      {
                        name: t('Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={item.spec.paramRef?.selector?.matchLabels}
                            matchExpressions={item.spec.paramRef?.selector?.matchExpressions}
                          />
                        ),
                        hide:
                          !item.spec.paramRef?.selector?.matchLabels &&
                          !item.spec.paramRef?.selector?.matchExpressions,
                      },
                    ]}
                  />
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.match-resources',
            section: () =>
              item.spec?.matchResources ? (
                <SectionBox title={t('Match Resources')}>
                  <NameValueTable
                    rows={[
                      {
                        name: t('Match Policy'),
                        value: item.spec.matchResources.matchPolicy,
                        hide: !item.spec.matchResources.matchPolicy,
                      },
                      {
                        name: t('Namespace Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={item.spec.matchResources.namespaceSelector?.matchLabels}
                            matchExpressions={
                              item.spec.matchResources.namespaceSelector?.matchExpressions
                            }
                          />
                        ),
                        hide:
                          !item.spec.matchResources.namespaceSelector?.matchLabels &&
                          !item.spec.matchResources.namespaceSelector?.matchExpressions,
                      },
                      {
                        name: t('Object Selector'),
                        value: (
                          <MatchExpressions
                            matchLabels={item.spec.matchResources.objectSelector?.matchLabels}
                            matchExpressions={
                              item.spec.matchResources.objectSelector?.matchExpressions
                            }
                          />
                        ),
                        hide:
                          !item.spec.matchResources.objectSelector?.matchLabels &&
                          !item.spec.matchResources.objectSelector?.matchExpressions,
                      },
                    ]}
                  />
                  {item.spec.matchResources.resourceRules &&
                    item.spec.matchResources.resourceRules.length > 0 && (
                      <SimpleTable
                        data={item.spec.matchResources.resourceRules}
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
        ]
      }
    />
  );
}
