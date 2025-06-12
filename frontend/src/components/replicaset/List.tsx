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
import { KubeContainer } from '../../lib/k8s/cluster';
import ReplicaSet from '../../lib/k8s/replicaSet';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export default function ReplicaSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Replica Sets')}
      resourceClass={ReplicaSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'generation',
          label: t('Generation'),
          getValue: replicaSet => replicaSet?.status?.observedGeneration,
          show: false,
        },
        {
          id: 'currentReplicas',
          label: t('translation|Current', { context: 'replicas' }),
          getValue: replicaSet => replicaSet?.status?.replicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'desiredReplicas',
          label: t('translation|Desired', { context: 'replicas' }),
          getValue: replicaSet => replicaSet?.spec?.replicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'readyReplicas',
          label: t('translation|Ready'),
          getValue: replicaSet => replicaSet?.status?.readyReplicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'containers',
          label: t('Containers'),
          getValue: replicaSet =>
            replicaSet
              .getContainers()
              .map(c => c.name)
              .join(''),
          render: replicaSet => {
            const containerText = replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.name)
              .join('\n');
            return (
              <LightTooltip title={containerText} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'images',
          label: t('Images'),
          getValue: replicaSet =>
            replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join(''),
          render: replicaSet => {
            const imageText = replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join('\n');
            return (
              <LightTooltip title={imageText} interactive>
                {imageText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'selector',
          label: t('Selector'),
          getValue: replicaSet => replicaSet.getMatchLabelsList().join(''),
          render: replicaSet => {
            const selectorText = replicaSet.getMatchLabelsList().join('\n');
            return (
              selectorText && (
                <LightTooltip title={selectorText} interactive>
                  {selectorText}
                </LightTooltip>
              )
            );
          },
        },
        'age',
      ]}
    />
  );
}
