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
import { DEFAULT_NODE_SHELL_NAMESPACE, loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import { AuthVisible } from '../common/Resource';
import { NodeShellTerminal } from './NodeShellTerminal';

interface NodeShellTerminalProps {
  item: Node | null;
}

function isNodeTerminalEnabled(cluster: string | null) {
  if (cluster === null) {
    return false;
  }
  const clusterSettings = loadClusterSettings(cluster);
  return clusterSettings.nodeShellTerminal?.isEnabled ?? true;
}

function nodeTerminalNamespace(cluster: string | null) {
  if (cluster === null) {
    return DEFAULT_NODE_SHELL_NAMESPACE;
  }
  const clusterSettings = loadClusterSettings(cluster);
  return clusterSettings.nodeShellTerminal?.namespace ?? DEFAULT_NODE_SHELL_NAMESPACE;
}

export function NodeShellAction(props: NodeShellTerminalProps) {
  const { item } = props;
  const { t } = useTranslation(['glossary']);
  if (item === null) {
    return <></>;
  }
  const cluster = getCluster();
  function isLinux(item: Node | null): boolean {
    return item?.status?.nodeInfo?.operatingSystem === 'linux';
  }
  const namepsace = nodeTerminalNamespace(cluster);
  const activityId = 'node-shell-' + item.metadata.uid;

  if (!isNodeTerminalEnabled(cluster)) {
    return <></>;
  }
  return (
    <>
      <AuthVisible authVerb="create" item={Pod} namespace={namepsace}>
        <AuthVisible item={Pod} namespace={namepsace} authVerb="get" subresource="exec">
          <ActionButton
            description={
              isLinux(item)
                ? t('Node Shell')
                : t('Node shell is not supported in this OS: {{ nodeOS }}', {
                    nodeOS: item?.status?.nodeInfo?.operatingSystem,
                  })
            }
            icon="mdi:console"
            onClick={() => {
              Activity.launch({
                id: activityId,
                location: 'full',
                title: t('Shell: {{ itemName }}', { itemName: item.metadata.name }),
                cluster: item.cluster,
                content: (
                  <NodeShellTerminal
                    key="terminal"
                    item={item}
                    onClose={() => Activity.close(activityId)}
                  />
                ),
              });
            }}
            iconButtonProps={{
              disabled: !isLinux(item),
            }}
          />
        </AuthVisible>
      </AuthVisible>
      {/* <NodeShellTerminal
        key="terminal"
        open={showShell}
        title={t('Shell: {{ itemName }}', { itemName: item.metadata.name })}
        item={item}
        onClose={() => {
          setShowShell(false);
        }}
      /> */}
    </>
  );
}
