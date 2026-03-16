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
import DaemonSet from '../../lib/k8s/daemonSet';
import { MetadataDictGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export default function DaemonSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Daemon Sets')}
      resourceClass={DaemonSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'pods',
          label: t('Pods'),
          getValue: daemonSet => daemonSet.status?.currentNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'currentPods',
          label: t('translation|Current'),
          getValue: daemonSet => daemonSet.status?.currentNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'desiredPods',
          label: t('translation|Desired', { context: 'pods' }),
          getValue: daemonSet => daemonSet.status?.desiredNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'readyPods',
          label: t('translation|Ready'),
          getValue: daemonSet => daemonSet.status?.numberReady || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'nodeSelector',
          label: t('Node Selector'),
          getValue: daemonSet => daemonSet.getNodeSelectors().join(', '),
          render: daemonSet =>
            daemonSet.spec?.template?.spec?.nodeSelector ? (
              <MetadataDictGrid dict={daemonSet.spec.template.spec.nodeSelector} />
            ) : null,
        },
        {
          id: 'containers',
          label: t('Containers'),
          getValue: daemonSet =>
            daemonSet
              .getContainers()
              .map((c: KubeContainer) => c.name)
              .join(', '),
          render: daemonSet => {
            const containerNames = daemonSet.getContainers().map((c: KubeContainer) => c.name);
            const containerText = containerNames.join(', ');
            const containerTooltip = containerNames.join('\n');
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
          getValue: daemonSet =>
            daemonSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join(', '),
          render: daemonSet => {
            const images = daemonSet.getContainers().map((c: KubeContainer) => c.image);
            const imageTooltip = images.join('\n');
            const imageText = images.join(', ');
            return (
              <LightTooltip title={imageTooltip} interactive>
                {imageText}
              </LightTooltip>
            );
          },
        },
        'age',
      ]}
    />
  );
}
