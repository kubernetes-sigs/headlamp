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
import HPA from '../../lib/k8s/hpa';
import { ConditionsSection, DetailsGrid, Link, SimpleTable } from '../common';

export default function HpaDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation();

  return (
    <DetailsGrid
      resourceType={HPA}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Reference'),
            value: (
              <Link kubeObject={item.referenceObject}>
                {item.referenceObject?.kind}/{item.referenceObject?.metadata.name}
              </Link>
            ),
          },
          {
            name: t('translation|Metrics'),
            value: (
              <SimpleTable
                data={item.metrics(t)}
                columns={[
                  { label: t('translation|Name'), getter: item => item.definition },
                  { label: t('translation|(Current/Target)'), getter: item => item.value },
                ]}
              />
            ),
          },
          {
            name: t('translation|MinReplicas'),
            value: item.spec.minReplicas,
          },
          {
            name: t('translation|MaxReplicas'),
            value: item.spec.maxReplicas,
          },
          {
            name: t('translation|Deployment pods'),
            value: t(`translation|{{ currentReplicas }} current / {{ desiredReplicas }} desired`, {
              currentReplicas: item.status.currentReplicas,
              desiredReplicas: item.status.desiredReplicas,
            }),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.hpa-conditions',
            section: <ConditionsSection resource={item?.jsonData} />,
          },
        ]
      }
    />
  );
}
