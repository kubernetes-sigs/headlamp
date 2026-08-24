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

import '../../../i18n/config';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import Link from '../../common/Link';
import TileChart from '../../common/TileChart';
import { hasAKSManagedNodes, useIsUpgradeDetected } from '../../node/upgradeDetection';
import { isNodeCordoned, isNodeDrained } from '../../node/utils';

export function PodsStatusCircleChart(props: { items: Pod[] | null }) {
  const theme = useTheme();
  const { items } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const podsReady = (items || []).filter((pod: Pod) => {
    if (pod.status!.phase === 'Succeeded') {
      return true;
    }

    const readyCondition = pod.status?.conditions?.find(condition => condition.type === 'Ready');
    return readyCondition?.status === 'True';
  });

  function getLegend() {
    if (items === null) {
      return null;
    }
    return t('translation|{{ numReady }} / {{ numItems }} Requested', {
      numReady: podsReady.length,
      numItems: items.length,
    });
  }

  function getLabel() {
    if (items === null) {
      return '…';
    }
    const percentage = ((podsReady.length / items.length) * 100).toFixed(1);
    return `${items.length === 0 ? 0 : percentage} %`;
  }

  function getData() {
    if (items === null) {
      return [];
    }

    return [
      {
        name: 'ready',
        value: podsReady.length,
      },
      {
        name: 'notReady',
        value: items.length - podsReady.length,
        fill: theme.palette.error.main,
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={t('glossary|Pods')}
      legend={getLegend()}
    />
  );
}

/**
 * Child component that fetches events and shows the upgrade link.
 * Only rendered when AKS nodes are detected, so non-AKS clusters
 * never pay the event-fetch cost.
 */
function NodesUpgradeLink() {
  const theme = useTheme();
  const { t } = useTranslation(['translation']);

  const upgradeDetected = useIsUpgradeDetected();

  if (!upgradeDetected) {
    return null;
  }

  return (
    <Link routeName="nodes" style={{ textDecoration: 'none' }}>
      <Typography
        variant="body2"
        component="span"
        sx={{
          color: theme.palette.warning.main,
          fontWeight: 600,
          '&:hover': { textDecoration: 'none' },
        }}
      >
        <span aria-hidden="true">⚡ </span>
        {t('Upgrade in Progress')}
      </Typography>
    </Link>
  );
}

export function NodesStatusCircleChart(props: {
  items: Node[] | null;
  pods?: Pod[] | null;
  podsLoaded?: boolean;
}) {
  const theme = useTheme();
  const { items, pods, podsLoaded } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const isAKSCluster = useMemo(() => {
    if (!items) return false;
    return hasAKSManagedNodes(items);
  }, [items]);

  const nodesReady = (items || []).filter((node: Node) => {
    const readyCondition = node.status?.conditions?.find(condition => condition.type === 'Ready');
    return readyCondition?.status === 'True';
  });

  // Bucket each node into one category: (schedulable / cordoned / drained / notReady).
  // Pods are indexed by clsuter + node name so we can determine which cordoned nodes are drained.
  // and prevent conflicts of similarly-named nodes across clusters.
  const { schedulable, cordoned, drained, notReady } = useMemo(() => {
    const podKey = (cluster: string, nodeName: string) => `${cluster}\n${nodeName}`;
    const podsByNode = new Map<string, Pod[]>();
    (pods || []).forEach(pod => {
      const nodeName = pod.spec?.nodeName;
      if (!nodeName) return;
      const key = podKey(pod.cluster, nodeName);
      const list = podsByNode.get(key) ?? [];
      list.push(pod);
      podsByNode.set(key, list);
    });

    const counts = { schedulable: 0, cordoned: 0, drained: 0, notReady: 0 };
    (items || []).forEach(node => {
      const ready =
        node.status?.conditions?.find(condition => condition.type === 'Ready')?.status === 'True';
      if (!ready) {
        counts.notReady++;
      } else if (!isNodeCordoned(node)) {
        counts.schedulable++;
      } else if (
        // Only treat a cordoned node as drained once the pod query has succeeded
        // An empty list while loading or after an error is not proof of no workloads.
        podsLoaded &&
        isNodeDrained(node, podsByNode.get(podKey(node.cluster, node.getName())) ?? [])
      ) {
        counts.drained++;
      } else {
        counts.cordoned++;
      }
    });
    return counts;
  }, [items, pods, podsLoaded]);

  function getLegend() {
    if (items === null) {
      return null;
    }
    return (
      <>
        {t('translation|{{ numReady }} / {{ numItems }} Ready', {
          numReady: nodesReady.length,
          numItems: items.length,
        })}
        {cordoned > 0 && (
          <>
            <br />
            {t('translation|{{ numCordoned }} Cordoned', { numCordoned: cordoned })}
          </>
        )}
        {drained > 0 && (
          <>
            <br />
            {t('translation|{{ numDrained }} Drained', { numDrained: drained })}
          </>
        )}
      </>
    );
  }

  function getLabel() {
    if (items === null) {
      return '…';
    }
    const percentage = ((nodesReady.length / items.length) * 100).toFixed(1);
    return `${items.length === 0 ? 0 : percentage} %`;
  }

  function getData() {
    if (items === null) {
      return [];
    }

    return [
      {
        name: 'ready',
        value: schedulable,
      },
      {
        name: 'cordoned',
        value: cordoned,
        fill: theme.palette.warning.main,
      },
      {
        name: 'drained',
        value: drained,
        fill: theme.palette.warning.dark,
      },
      {
        name: 'notReady',
        value: notReady,
        fill: theme.palette.error.main,
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={t('glossary|Nodes')}
      legend={getLegend()}
      extraContent={isAKSCluster ? <NodesUpgradeLink /> : null}
    />
  );
}
