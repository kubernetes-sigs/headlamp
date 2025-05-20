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
import VPA from '../../lib/k8s/vpa';
import { DateLabel } from '../common/Label';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function VpaDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const formatRecommendation = (data: Record<string, string>): string => {
    let result = '';
    if (data && Object.keys(data).length > 0) {
      Object.keys(data).forEach(key => {
        result += `${key}:${data[key]},`;
      });
      result = result.slice(0, -1);
    }
    return result;
  };

  return (
    <DetailsGrid
      resourceType={VPA}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Reference'),
            value: (
              <Link kubeObject={item?.referenceObject}>
                {item?.referenceObject?.kind}/{item?.referenceObject?.metadata?.name}
              </Link>
            ),
          },
          {
            name: t('glossary|Update Policy'),
            value: (
              <>
                {t('glossary|Update Mode')}:{item?.spec?.updatePolicy?.updateMode}
              </>
            ),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.vpa-container-policy',
            section: (
              <SectionBox title={t('glossary|Container Policy')}>
                <SimpleTable
                  data={item?.spec?.resourcePolicy?.containerPolicies}
                  columns={[
                    {
                      label: t('glossary|Container'),
                      getter: item => item?.containerName,
                    },
                    {
                      label: t('translation|Controlled Resources'),
                      getter: item => item?.controlledResources.join(', '),
                    },
                    {
                      label: t('translation|Controlled Values'),
                      getter: item => item?.controlledValues,
                    },
                    {
                      label: t('translation|Min Allowed'),
                      getter: item => {
                        let minAllowed = '';
                        if (item?.minAllowed && Object.keys(item.minAllowed).length > 0) {
                          Object.keys(item.minAllowed).map(key => {
                            minAllowed += `${item.minAllowed[key]},`;
                          });
                        }
                        minAllowed = minAllowed.slice(0, -1);
                        return minAllowed;
                      },
                    },
                    {
                      label: t('translation|Max Allowed'),
                      getter: item => {
                        let maxAllowed = '';
                        if (item?.maxAllowed && Object.keys(item.maxAllowed).length > 0) {
                          Object.keys(item.maxAllowed).map(key => {
                            maxAllowed += `${item.maxAllowed[key]},`;
                          });
                        }
                        maxAllowed = maxAllowed.slice(0, -1);
                        return maxAllowed;
                      },
                    },
                    {
                      label: t('translation|Mode'),
                      getter: item => item?.mode,
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.vpa-status-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                <SimpleTable
                  data={item?.status?.conditions}
                  columns={[
                    {
                      label: t('translation|Type'),
                      getter: item => item?.type,
                    },
                    {
                      label: t('translation|Status'),
                      getter: item => item?.status,
                    },
                    {
                      label: t('translation|Reason'),
                      getter: item => item?.reason,
                    },
                    {
                      label: t('translation|Message'),
                      getter: item => item?.message,
                    },
                    {
                      label: t('translation|Last Transition Time'),
                      getter: item => <DateLabel date={item?.lastTransitionTime} format="brief" />,
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.vpa-recommendations',
            section: (
              <SectionBox title={t('translation|Recommendations')}>
                <SimpleTable
                  data={item?.status?.recommendation?.containerRecommendations}
                  columns={[
                    {
                      label: t('glossary|Container'),
                      getter: item => item.containerName,
                    },
                    {
                      label: t('glossary|Lower Bound'),
                      getter: item => item?.lowerBound && formatRecommendation(item.lowerBound),
                    },
                    {
                      label: t('glossary|Target'),
                      getter: item => item?.target && formatRecommendation(item.target),
                    },
                    {
                      label: t('glossary|Upper Bound'),
                      getter: item => item?.upperBound && formatRecommendation(item.upperBound),
                    },
                    {
                      label: t('glossary|Uncapped Target'),
                      getter: item =>
                        item?.uncappedTarget && formatRecommendation(item.uncappedTarget),
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
