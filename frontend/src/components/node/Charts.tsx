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

import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeMetrics } from '../../lib/k8s/cluster';
import Node from '../../lib/k8s/node';
import { getPercentStr, getResourceMetrics, getResourceStr } from '../../lib/util';
import { TooltipIcon } from '../common';
import { PercentageBar } from '../common/Chart';

interface UsageBarChartProps {
  node: Node;
  nodeMetrics: KubeMetrics[] | null;
  resourceType: keyof KubeMetrics['usage'];
  noMetrics?: boolean;
}

export function UsageBarChart(props: UsageBarChartProps) {
  const { node, nodeMetrics, resourceType, noMetrics = false } = props;
  const { t } = useTranslation(['translation']);
  let [used, capacity] = [0, 0];

  if (node) {
    [used, capacity] = getResourceMetrics(node, nodeMetrics || [], resourceType);
  }

  const data = [
    {
      name: t('used'),
      value: used,
    },
  ];

  function tooltipFunc() {
    return (
      <Typography>
        {getResourceStr(used, resourceType)} of {getResourceStr(capacity, resourceType)} (
        {getPercentStr(used, capacity)})
      </Typography>
    );
  }

  return noMetrics ? (
    <>
      <Typography display="inline">{getResourceStr(capacity, resourceType)}</Typography>
      <TooltipIcon>{t('translation|Install the metrics-server to get usage data.')}</TooltipIcon>
    </>
  ) : (
    <PercentageBar data={data} total={capacity} tooltipFunc={tooltipFunc} />
  );
}
