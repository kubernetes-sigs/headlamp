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
import { DEFAULT_NODE_SHELL_NAMESPACE } from '../../helpers/clusterSettings';
import { getCluster } from '../../lib/cluster';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { useTypedSelector } from '../../redux/hooks';
import { useSetting } from '../../settings/useAdminSettings';
import { Activity } from '../activity/Activity';
import ActionButton from '../common/ActionButton';
import { AuthVisible } from '../common/Resource';
import { NodeShellTerminal } from './NodeShellTerminal';

interface NodeShellTerminalProps {
  item: Node | null;
}

export function NodeShellAction(props: NodeShellTerminalProps) {
  const { item } = props;
  const { t } = useTranslation(['glossary']);
  const cluster = getCluster();
  const isEnabledSetting = useSetting<boolean>(
    'clusters.*.nodeShellTerminal.isEnabled',
    cluster ?? undefined
  );
  const namespaceSetting = useSetting<string>(
    'clusters.*.nodeShellTerminal.namespace',
    cluster ?? undefined
  );
  const defaultNamespace = useTypedSelector(state => state.config.defaultNodeShellNamespace);

  if (item === null || cluster === null) {
    return <></>;
  }
  function isLinux(item: Node | null): boolean {
    return item?.status?.nodeInfo?.operatingSystem === 'linux';
  }
  const isEnabled = isEnabledSetting.value ?? true;
  const namespace = namespaceSetting.value || defaultNamespace || DEFAULT_NODE_SHELL_NAMESPACE;
  const activityId = 'node-shell-' + item.metadata.uid;

  if (!isEnabled) {
    return <></>;
  }
  return (
    <>
      <AuthVisible authVerb="create" item={Pod} namespace={namespace}>
        <AuthVisible item={Pod} namespace={namespace} authVerb="get" subresource="exec">
          <ActionButton
            description={
              isLinux(item)
                ? t('Debug Node')
                : t('Debug node is not supported in this OS: {{ nodeOS }}', {
                    nodeOS: item?.status?.nodeInfo?.operatingSystem,
                  })
            }
            icon="mdi:bug"
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
    </>
  );
}
