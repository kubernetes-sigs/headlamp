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
import { useHistory } from 'react-router-dom';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import Link from '../../common/Link';
import TileChart from '../../common/TileChart';
import { hasAKSManagedNodes, useIsUpgradeDetected } from '../../node/upgradeDetection';

export function PodsStatusCircleChart(props: { items: Pod[] | null }) {
  const theme = useTheme();
  const history = useHistory();
  const { items } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const podsReady = (items || []).filter((pod: Pod) => {
    const readyCondition = pod.status?.conditions?.find(
      (condition: { type: string; status: string }) => condition.type === 'Ready'
    );
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
        label: t('translation|Ready'),
        value: podsReady.length,
        fill: theme.palette.success.main,
        onClick: () => history.push(createRouteURL('pods') + '?podsfilter=Running'),
      },
      {
        name: 'notReady',
        label: t('translation|Not Ready'),
        value: items.length - podsReady.length,
        fill: theme.palette.error.main,
        onClick: () => history.push(createRouteURL('pods') + '?podsfilter=NotReady'),
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={<Link routeName="pods">{t('glossary|Pods')}</Link>}
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

export function NodesStatusCircleChart(props: { items: Node[] | null }) {
  const theme = useTheme();
  const history = useHistory();
  const { items } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const isAKSCluster = useMemo(() => {
    if (!items) return false;
    return hasAKSManagedNodes(items);
  }, [items]);

  const nodesReady = (items || []).filter((node: Node) => {
    const readyCondition = node.status?.conditions?.find(condition => condition.type === 'Ready');
    return readyCondition?.status === 'True';
  });

  function getLegend() {
    if (items === null) {
      return null;
    }
    return t('translation|{{ numReady }} / {{ numItems }} Ready', {
      numReady: nodesReady.length,
      numItems: items.length,
    });
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

    const yesLabel = t('translation|Yes');
    const noLabel = t('translation|No');
    return [
      {
        name: 'ready',
        label: t('translation|Ready'),
        value: nodesReady.length,
        fill: theme.palette.success.main,
        onClick: () =>
          history.push(createRouteURL('nodes') + `?nodesfilter=${encodeURIComponent(yesLabel)}`),
      },
      {
        name: 'notReady',
        label: t('translation|Not Ready'),
        value: items.length - nodesReady.length,
        fill: theme.palette.error.main,
        onClick: () =>
          history.push(createRouteURL('nodes') + `?nodesfilter=${encodeURIComponent(noLabel)}`),
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={<Link routeName="nodes">{t('glossary|Nodes')}</Link>}
      legend={getLegend()}
      extraContent={isAKSCluster ? <NodesUpgradeLink /> : null}
    />
  );
}
