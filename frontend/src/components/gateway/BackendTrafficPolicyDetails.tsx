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
import BackendTrafficPolicy from '../../lib/k8s/backendTrafficPolicy';
import EmptyContent from '../common/EmptyContent';
import LabelListItem from '../common/LabelListItem';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { NameValueTable } from '../common/SimpleTable';

/**
 * Formats session persistence settings as "key: value" labels. Nested objects such as
 * cookieConfig are flattened to dotted keys (cookieConfig.lifetimeType: Permanent), since
 * String() would render them as "[object Object]".
 */
export function formatSessionPersistence(settings: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(settings).flatMap(([key, value]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return formatSessionPersistence(value as Record<string, unknown>, label);
    }
    return [`${label}: ${Array.isArray(value) ? value.join(', ') : String(value)}`];
  });
}

interface RetryConstraint {
  budget?: {
    percent?: number;
    interval?: string;
  };
  minRetryRate?: {
    count?: number;
    interval?: string;
  };
}

function RetryConstraintTable(props: { retry: RetryConstraint }) {
  const { retry } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const mainRows = [
    {
      name: t('translation|Retry Budget'),
      value: retry.budget
        ? `${retry.budget.percent ?? 20}% over ${retry.budget.interval ?? '10s'}`
        : t('translation|Not specified'),
    },
    {
      name: t('translation|Min Retry Rate'),
      value: retry.minRetryRate
        ? `${retry.minRetryRate.count ?? 10} reqs/${retry.minRetryRate.interval ?? '1s'}`
        : t('translation|Not specified'),
    },
  ];

  return <NameValueTable rows={mainRows} />;
}

export default function BackendTrafficPolicyDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={BackendTrafficPolicy}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={(item: BackendTrafficPolicy) =>
        item && [
          {
            id: 'backendtrafficpolicy.targets',
            section: (
              <SectionBox title={t('Targets')}>
                {item.targetRefs?.length > 0 ? (
                  <LabelListItem
                    labels={item.targetRefs.map(ref =>
                      ref.sectionName
                        ? `${ref.kind} (${ref.name}:${ref.sectionName})`
                        : `${ref.kind} (${ref.name})`
                    )}
                  />
                ) : (
                  <EmptyContent>{t('No targets defined')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
          {
            id: 'backendtrafficpolicy.retryconstraint',
            section: (
              <SectionBox title={t('Retry Constraint')}>
                {item.retryConstraint ? (
                  <RetryConstraintTable retry={item.retryConstraint} />
                ) : (
                  <EmptyContent>{t('No retry constraint configured')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
          {
            id: 'backendtrafficpolicy.sessionpersistence',
            section: (
              <SectionBox title={t('Session Persistence')}>
                {item.sessionPersistence ? (
                  <LabelListItem labels={formatSessionPersistence(item.sessionPersistence)} />
                ) : (
                  <EmptyContent>{t('No session persistence configured')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
