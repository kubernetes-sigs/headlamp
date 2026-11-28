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
import HPA, { HPAScalingPolicy, HPAScalingRules } from '../../lib/k8s/hpa';
import { localeDate } from '../../lib/util';
import Link from '../common/Link';
import { ConditionsSection } from '../common/Resource';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

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
            value: (() => {
              const target = item.spec?.scaleTargetRef;
              return item.referenceObject ? (
                <Link kubeObject={item.referenceObject}>
                  {item.referenceObject?.kind}/{item.referenceObject?.metadata?.name}
                </Link>
              ) : target?.kind && target?.name ? (
                `${target.kind}/${target.name}`
              ) : (
                '-'
              );
            })(),
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
            value: item.spec?.minReplicas,
          },
          {
            name: t('translation|MaxReplicas'),
            value: item.spec?.maxReplicas,
          },
          {
            name: t('translation|Deployment pods'),
            value: t(`translation|{{ currentReplicas }} current / {{ desiredReplicas }} desired`, {
              currentReplicas: item.status?.currentReplicas ?? 0,
              desiredReplicas: item.status?.desiredReplicas ?? 0,
            }),
          },
          {
            name: t('translation|Last Scale Time'),
            value: item.status?.lastScaleTime ? localeDate(item.status.lastScaleTime) : '',
            hide: !item.status?.lastScaleTime,
          },
        ]
      }
      extraSections={item =>
        item && [
          ...(item.spec?.behavior?.scaleUp || item.spec?.behavior?.scaleDown
            ? [
                {
                  id: 'headlamp.hpa-scaling-behavior',
                  section: <ScalingBehavior hpa={item} />,
                },
              ]
            : []),
          {
            id: 'headlamp.hpa-conditions',
            section: <ConditionsSection resource={item?.jsonData} />,
          },
        ]
      }
    />
  );
}

/** Text for one scaling policy, e.g. "4 pods per 60s" or "100% per 15s". */
export function scalingPolicyText(
  policy: HPAScalingPolicy,
  t: (key: string, opts?: any) => string
) {
  return policy.type === 'Percent'
    ? t('translation|{{ value }}% per {{ seconds }}s', {
        value: policy.value,
        seconds: policy.periodSeconds,
      })
    : t('translation|{{ value }} pods per {{ seconds }}s', {
        value: policy.value,
        seconds: policy.periodSeconds,
      });
}

/**
 * The scale up and scale down rules of `spec.behavior`, which limit how fast the
 * HPA changes the number of replicas.
 */
function ScalingBehavior({ hpa }: { hpa: HPA }) {
  const { t } = useTranslation();
  const behavior = hpa.spec?.behavior;
  const rows = [
    { direction: t('translation|Scale Up'), rules: behavior?.scaleUp },
    { direction: t('translation|Scale Down'), rules: behavior?.scaleDown },
  ].filter((row): row is { direction: string; rules: HPAScalingRules } => !!row.rules);

  return (
    <SectionBox title={t('translation|Scaling Behavior')}>
      <SimpleTable
        data={rows}
        columns={[
          { label: t('translation|Direction'), getter: row => row.direction },
          {
            label: t('translation|Stabilization Window'),
            getter: row =>
              row.rules.stabilizationWindowSeconds !== undefined
                ? `${row.rules.stabilizationWindowSeconds}s`
                : '-',
          },
          { label: t('translation|Select Policy'), getter: row => row.rules.selectPolicy ?? '-' },
          {
            label: t('translation|Policies'),
            getter: row =>
              row.rules.policies?.length
                ? row.rules.policies.map((policy: HPAScalingPolicy, i: number) => (
                    <div key={i}>{scalingPolicyText(policy, t)}</div>
                  ))
                : '-',
          },
        ]}
      />
    </SectionBox>
  );
}
