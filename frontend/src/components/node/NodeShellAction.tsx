import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import helpers, { DEFAULT_NODE_SHELL_NAMESPACE } from '../../helpers';
import { getCluster } from '../../lib/cluster';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { ActionButton, AuthVisible } from '../common';
import { NodeShellTerminal } from './NodeShellTerminal';

interface NodeShellTerminalProps {
  item: Node | null;
}

function isNodeTerminalEnabled(cluster: string | null) {
  if (cluster === null) {
    return false;
  }
  const clusterSettings = helpers.loadClusterSettings(cluster);
  return clusterSettings.nodeShellTerminal?.isEnabled ?? true;
}

function nodeTerminalNamespace(cluster: string | null) {
  if (cluster === null) {
    return DEFAULT_NODE_SHELL_NAMESPACE;
  }
  const clusterSettings = helpers.loadClusterSettings(cluster);
  return clusterSettings.nodeShellTerminal?.namespace ?? DEFAULT_NODE_SHELL_NAMESPACE;
}

export function NodeShellAction(props: NodeShellTerminalProps) {
  const { item } = props;
  const { t } = useTranslation(['glossary']);
  const [showShell, setShowShell] = useState(false);
  if (item === null) {
    return <></>;
  }
  const cluster = getCluster();
  function isLinux(item: Node | null): boolean {
    return item?.status?.nodeInfo?.operatingSystem === 'linux';
  }
  const namepsace = nodeTerminalNamespace(cluster);

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
            onClick={() => setShowShell(true)}
            iconButtonProps={{
              disabled: !isLinux(item),
            }}
          />
        </AuthVisible>
      </AuthVisible>
      <NodeShellTerminal
        key="terminal"
        open={showShell}
        title={t('Shell: {{ itemName }}', { itemName: item.metadata.name })}
        item={item}
        onClose={() => {
          setShowShell(false);
        }}
      />
    </>
  );
}
