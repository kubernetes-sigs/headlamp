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

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workload, WorkloadHealthCategory } from '../../lib/k8s/Workload';
import { getPercentStr, getReadyReplicas, getTotalReplicas } from '../../lib/util';
import type { ChartDataPoint, PercentageCircleProps } from '../common/Chart';
import TileChart from '../common/TileChart';

export interface WorkloadCircleChartProps extends Omit<PercentageCircleProps, 'data'> {
  workloadData: Workload[] | null;
  partialLabel: string;
  totalLabel: string;
  /**
   * Optional per-item health classifier. When provided, the chart renders a
   * multi-segment ring (healthy / degraded / transitional / failed) instead of
   * the default binary ring. Used for Pods, which have no replica fields and
   * whose health can't be derived from a ready/total replica mismatch.
   */
  categorize?: (item: Workload) => WorkloadHealthCategory;
}

export function WorkloadCircleChart(props: WorkloadCircleChartProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const { workloadData, partialLabel = '', totalLabel = '', categorize, ...other } = props;

  // Binary path: a workload counts as "partial" (failed) when its ready replicas
  // don't match its total replicas. Correct for Deployments, StatefulSets, etc.
  const [total, partial] = useMemo(() => {
    // Total as -1 means it's loading.
    const total = !workloadData ? -1 : workloadData.length;
    const partial =
      workloadData?.filter(item => getReadyReplicas(item) !== getTotalReplicas(item)).length || 0;

    return [total, partial];
  }, [workloadData]);

  // Categorized path: bucket every item into a health category.
  const counts = useMemo(() => {
    if (!workloadData || !categorize) {
      return null;
    }
    const buckets = { healthy: 0, degraded: 0, transitional: 0, failed: 0 };
    workloadData.forEach(item => {
      buckets[categorize(item)]++;
    });
    return buckets;
  }, [workloadData, categorize]);

  function makeData(): ChartDataPoint[] {
    if (counts) {
      // Order around the ring: healthy → degraded → transitional → failed.
      return [
        { name: 'healthy', value: counts.healthy, fill: theme.palette.success.main },
        { name: 'degraded', value: counts.degraded, fill: theme.palette.warning.main },
        { name: 'transitional', value: counts.transitional, fill: theme.palette.grey[500] },
        { name: 'failed', value: counts.failed, fill: theme.palette.error.main },
      ];
    }
    return [
      {
        name: 'failed',
        value: partial,
        fill: theme.palette.error.main,
      },
    ];
  }

  function getLabel() {
    if (counts) {
      return total > 0 ? getPercentStr(counts.healthy, total) : '';
    }
    return total > 0 ? getPercentStr(total - partial, total) : '';
  }

  function getLegend() {
    if (total === -1) {
      return '…';
    }
    if (total === 0) {
      return `0 ${totalLabel}`;
    }

    if (counts) {
      // Main line is the healthy count; the secondary line breaks down the rest.
      const breakdown = [
        counts.failed && `${counts.failed} ${partialLabel}`,
        counts.degraded && `${counts.degraded} ${t('translation|Degraded')}`,
        counts.transitional && `${counts.transitional} ${t('translation|Other')}`,
      ].filter(Boolean);

      return (
        <>
          {`${counts.healthy} ${totalLabel}`}
          {breakdown.length > 0 && (
            <Box component="span" sx={{ display: 'block', fontSize: '0.85em', opacity: 0.7 }}>
              {breakdown.join(' · ')}
            </Box>
          )}
        </>
      );
    }

    if (partial !== 0) {
      return `${partial} ${partialLabel} / ${total} ${totalLabel}`;
    }

    return `${total} ${totalLabel}`;
  }

  return (
    <TileChart
      data={makeData()}
      total={total}
      totalProps={{
        fill: theme.palette.chartStyles.fillColor || theme.palette.common.black,
      }}
      label={getLabel()}
      legend={getLegend()}
      {...other}
    />
  );
}
