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
import StatefulSet from '../../lib/k8s/statefulSet';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export default function StatefulSetList() {
  const { t } = useTranslation('glossary');

  function renderPods(statefulSet: StatefulSet) {
    const { readyReplicas, replicas } = statefulSet.status;

    return `${readyReplicas || 0}/${replicas || 0}`;
  }

  return (
    <ResourceListView
      title={t('Stateful Sets')}
      resourceClass={StatefulSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'pods',
          label: t('Pods'),
          disableFiltering: true,
          getValue: statefulSet => renderPods(statefulSet),
          gridTemplate: 'min-content',
        },
        {
          id: 'replicas',
          label: t('Replicas'),
          getValue: statefulSet => statefulSet.spec.replicas,
          gridTemplate: 'min-content',
        },
        {
          id: 'containers',
          label: t('Containers'),
          gridTemplate: 'auto',
          getValue: statefulSet =>
            statefulSet
              .getContainers()
              .map(c => c.name)
              .join(', '),
          render: statefulSet => {
            const containerNames = statefulSet.getContainers().map((c: KubeContainer) => c.name);
            const containerTooltip = containerNames.join('\n');
            const containerText = containerNames.join(', ');

            return (
              <LightTooltip title={containerTooltip} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'images',
          label: t('Images'),
          gridTemplate: 'auto',
          getValue: statefulSet =>
            statefulSet
              .getContainers()
              .map(it => it.image)
              .join(', '),
          render: statefulSet => {
            const containerImages = statefulSet.getContainers().map((c: KubeContainer) => c.image);
            const containerTooltip = containerImages.join('\n');
            const containerText = containerImages.join(', ');
            return (
              <LightTooltip title={containerTooltip} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        'age',
      ]}
    />
  );
}
