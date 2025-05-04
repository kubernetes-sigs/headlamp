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

import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Workload } from '../../lib/k8s/Workload';
import { getPercentStr, getReadyReplicas, getTotalReplicas } from '../../lib/util';
import { PercentageCircleProps } from '../common/Chart';
import TileChart from '../common/TileChart';

interface WorkloadCircleChartProps extends Omit<PercentageCircleProps, 'data'> {
  workloadData: Workload[] | null;
  partialLabel: string;
  totalLabel: string;
}

export function WorkloadCircleChart(props: WorkloadCircleChartProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const { workloadData, partialLabel = '', totalLabel = '', ...other } = props;

  const [total, partial] = useMemo(() => {
    // Total as -1 means it's loading.
    const total = !workloadData ? -1 : workloadData.length;
    const partial =
      workloadData?.filter(item => getReadyReplicas(item) !== getTotalReplicas(item)).length || 0;

    return [total, partial];
  }, [workloadData]);

  function makeData() {
    return [
      {
        name: 'failed',
        value: partial,
        fill: theme.palette.error.main,
      },
    ];
  }

  function getLabel() {
    return total > 0 ? getPercentStr(total - partial, total) : '';
  }

  function getLegend() {
    if (total === -1) {
      return '…';
    }
    if (total === 0) {
      return t('translation|0 Running');
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
