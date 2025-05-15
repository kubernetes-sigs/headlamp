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
import Node from '../../lib/k8s/node';
import { getResourceMetrics } from '../../lib/util';
import { HoverInfoLabel } from '../common';
import ResourceListView from '../common/Resource/ResourceListView';
import { UsageBarChart } from './Charts';
import { NodeReadyLabel } from './Details';
import { formatTaint, NodeTaintsLabel } from './utils';

export default function NodeList() {
  const [nodeMetrics, metricsError] = Node.useMetrics();
  const { t } = useTranslation(['glossary', 'translation']);

  const noMetrics = metricsError?.status === 404;

  return (
    <ResourceListView
      title={t('Nodes')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={Node}
      columns={[
        'name',
        'cluster',
        {
          id: 'cpu',
          label: t('CPU'),
          gridTemplate: 'min-content',
          getValue: node => {
            const [used] = getResourceMetrics(node, nodeMetrics || [], 'cpu');
            return used;
          },
          render: node => (
            <UsageBarChart
              node={node}
              nodeMetrics={nodeMetrics}
              resourceType="cpu"
              noMetrics={noMetrics}
            />
          ),
        },
        {
          id: 'memory',
          label: t('Memory'),
          getValue: node => {
            const [used] = getResourceMetrics(node, nodeMetrics || [], 'memory');
            return used;
          },
          render: node => (
            <UsageBarChart
              node={node}
              nodeMetrics={nodeMetrics}
              resourceType="memory"
              noMetrics={noMetrics}
            />
          ),
        },
        {
          id: 'ready',
          label: t('translation|Ready'),
          getValue: node => {
            const isReady = !!node.status.conditions?.find(
              condition => condition.type === 'Ready' && condition.status === 'True'
            );
            return isReady ? t('translation|Yes') : t('translation|No');
          },
          render: node => <NodeReadyLabel node={node} />,
        },
        {
          id: 'taints',
          label: t('translation|Taints'),
          getValue: node => node.spec?.taints?.map(taint => formatTaint(taint))?.join(', '),
          render: (item: Node) => <NodeTaintsLabel node={item} />,
        },
        {
          id: 'roles',
          label: t('Roles'),
          gridTemplate: 'minmax(150px, .5fr)',
          getValue: node => {
            return Object.keys(node.metadata.labels ?? {})
              .filter((t: String) => t.startsWith('node-role.kubernetes.io/'))
              .map(t => t.replace('node-role.kubernetes.io/', ''))
              .join(',');
          },
        },
        {
          id: 'internalIP',
          label: t('translation|Internal IP'),
          getValue: node => node.getInternalIP(),
        },
        {
          id: 'externalIP',
          label: t('External IP'),
          getValue: node => node.getExternalIP() || t('translation|None'),
        },
        {
          id: 'version',
          label: t('translation|Version'),
          gridTemplate: 'minmax(150px, .5fr)',
          getValue: node => node.status.nodeInfo?.kubeletVersion,
        },
        {
          id: 'software',
          label: t('translation|Software'),
          gridTemplate: 'minmax(200px, 1.5fr)',
          getValue: node => node.status.nodeInfo?.operatingSystem,
          render: node => {
            if (node.status.nodeInfo === undefined) {
              return <></>;
            }
            let osIcon = 'mdi:desktop-classic';
            if (node.status.nodeInfo.operatingSystem === 'linux') {
              osIcon = 'mdi:linux';
            } else if (node.status.nodeInfo.operatingSystem === 'windows') {
              osIcon = 'mdi:microsoft-windows';
            }

            return (
              <>
                <HoverInfoLabel
                  label={node.status.nodeInfo.osImage}
                  hoverInfo={t('OS image')}
                  labelProps={{ variant: 'body2' }}
                  iconPosition="start"
                  icon={osIcon}
                />
                {node.status.nodeInfo.kernelVersion && (
                  <HoverInfoLabel
                    label={node.status.nodeInfo.kernelVersion}
                    hoverInfo={t('Kernel version')}
                    labelProps={{ variant: 'body2' }}
                    iconPosition="start"
                    icon="mdi:nut"
                  />
                )}
                <HoverInfoLabel
                  label={node.status.nodeInfo.containerRuntimeVersion}
                  hoverInfo={t('Container Runtime')}
                  labelProps={{ variant: 'body2' }}
                  iconPosition="start"
                  icon="mdi:train-car-container"
                />
              </>
            );
          },
          show: false,
        },
        'age',
      ]}
    />
  );
}
