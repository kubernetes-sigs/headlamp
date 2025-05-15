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
import MutatingWebhookConfiguration from '../../lib/k8s/mutatingWebhookConfiguration';
import ValidatingWebhookConfiguration from '../../lib/k8s/validatingWebhookConfiguration';
import { Link, NameValueTable, SectionBox, SimpleTable } from '../common';
import { DetailsGrid, SecretField } from '../common/Resource';
import { MatchExpressions } from '../common/Resource/MatchExpressions';

export interface WebhookConfigurationDetailsProps {
  resourceClass: typeof ValidatingWebhookConfiguration | typeof MutatingWebhookConfiguration;
  name: string;
  cluster?: string;
}

export default function WebhookConfigurationDetails(props: WebhookConfigurationDetailsProps) {
  const { resourceClass, name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={resourceClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('API Version'),
            value: item.metadata.apiVersion,
          },
          {
            name: t('Webhooks'),
            value: item.webhooks?.length || 0,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.webhooks-data',
            section: () => (
              <SectionBox title={t('Webhooks')}>
                {item.webhooks?.map(
                  (
                    webhook:
                      | ValidatingWebhookConfiguration['webhooks'][number]
                      | MutatingWebhookConfiguration['webhooks'][number]
                  ) => (
                    <NameValueTable
                      key={webhook.name}
                      rows={[
                        {
                          name: t('translation|Name'),
                          value: webhook.name,
                        },
                        {
                          name: t('translation|Admission Review Versions'),
                          value: webhook.admissionReviewVersions?.join(', '),
                        },
                        {
                          name: webhook.clientConfig?.url
                            ? t('translation|Client Config: URL')
                            : t('translation|Client Config: Service'),
                          value: webhook.clientConfig?.url ? (
                            webhook.clientConfig?.url
                          ) : (
                            <>
                              <Link
                                routeName="service"
                                params={{
                                  name: webhook.clientConfig?.service?.name,
                                  namespace: webhook.clientConfig?.service?.namespace,
                                }}
                                activeCluster={item.cluster}
                              >
                                {t('translation|Service: {{namespace}}/{{name}}', {
                                  namespace: webhook.clientConfig?.service?.namespace,
                                  name: webhook.clientConfig?.service?.name,
                                })}
                              </Link>
                              <br />
                              {t('translation|Path: {{ path }}:{{ port }}', {
                                path: webhook.clientConfig?.service?.path,
                                port: webhook.clientConfig?.service?.port || 443,
                              })}
                            </>
                          ),
                        },
                        {
                          name: t('Client Config: Ca Bundle'),
                          value: <SecretField value={webhook.clientConfig?.caBundle} />,
                        },
                        {
                          name: t('Failure Policy'),
                          value: webhook.failurePolicy,
                        },
                        {
                          name: t('Match Policy'),
                          value: webhook.matchPolicy,
                        },
                        {
                          name: t('Side Effects'),
                          value: webhook.sideEffects,
                        },
                        {
                          name: t('Timeout Seconds'),
                          value: webhook.timeoutSeconds?.toString(),
                        },
                        {
                          name: t('Namespace Selector'),
                          value: (
                            <MatchExpressions
                              matchLabels={webhook.namespaceSelector?.matchLabels}
                              matchExpressions={webhook.namespaceSelector?.matchExpressions}
                            />
                          ),
                        },
                        {
                          name: t('Object Selector'),
                          value: (
                            <MatchExpressions
                              matchLabels={webhook.objectSelector?.matchLabels}
                              matchExpressions={webhook.objectSelector?.matchExpressions}
                            />
                          ),
                        },
                        {
                          name: t('Reinvocation Policy'),
                          value: (webhook as MutatingWebhookConfiguration['webhooks'][number])
                            .reinvocationPolicy,
                          hide: !(webhook as MutatingWebhookConfiguration['webhooks'][number])
                            .reinvocationPolicy,
                        },
                        {
                          name: t('Rules'),
                          value: (
                            <SimpleTable
                              data={webhook.rules || []}
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
                                  getter: rule => rule.scope,
                                },
                              ]}
                            />
                          ),
                        },
                      ]}
                    />
                  )
                )}
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
