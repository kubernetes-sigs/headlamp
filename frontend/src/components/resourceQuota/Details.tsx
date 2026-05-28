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
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import { parseCpu, parseRam, TO_ONE_CPU } from '../../lib/units';
import { compareUnits, normalizeUnit } from '../../lib/util';
import { DetailsGrid } from '../common/Resource';
import SimpleTable from '../common/SimpleTable';

/**
 * Computes the usage ratio (used / hard) for a given resource by parsing
 * the used and hard values according to their resource type.
 *
 * Note: the returned ratio can be > 1 when used exceeds hard, and is 0 when hard is 0.
 */
export function getUsageRatio(name: string, used: string, hard: string): number {
  const resourceType = name.includes('.') ? name.split('.').pop()! : name;

  let usedNum: number;
  let hardNum: number;

  switch (resourceType) {
    case 'cpu':
      usedNum = /(n|u|m)$/.test(used.trim())
        ? parseCpu(used)
        : parseFloat(used || '0') * TO_ONE_CPU;
      hardNum = /(n|u|m)$/.test(hard.trim())
        ? parseCpu(hard)
        : parseFloat(hard || '0') * TO_ONE_CPU;
      break;
    case 'memory':
    case 'storage':
    case 'ephemeral-storage':
      usedNum = parseRam(used);
      hardNum = parseRam(hard);
      break;
    default:
      if (resourceType.startsWith('hugepages-')) {
        usedNum = parseRam(used);
        hardNum = parseRam(hard);
      } else {
        usedNum = parseInt(used, 10) || 0;
        hardNum = parseInt(hard, 10) || 0;
      }
      break;
  }

  if (hardNum === 0) return 0;
  return usedNum / hardNum;
}

function getProgressColor(ratio: number): 'success' | 'warning' | 'error' {
  if (ratio >= 0.9) return 'error';
  if (ratio >= 0.8) return 'warning';
  return 'success';
}

export function QuotaUsageBar({ name, used, hard }: { name: string; used: string; hard: string }) {
  const { t } = useTranslation();
  const ratio = getUsageRatio(name, used, hard);
  const percentage = Math.floor(ratio * 100);
  const barValue = Math.min(percentage, 100);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 120 }}>
      <Box sx={{ flex: 1, mr: 1 }}>
        <LinearProgress
          aria-label={`${name} ${t('translation|Usage')}`}
          aria-valuetext={`${percentage}%`}
          variant="determinate"
          value={barValue}
          color={getProgressColor(ratio)}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 35 }}>
        {percentage}%
      </Typography>
    </Box>
  );
}

export function ResourceQuotaTable({
  resourceStats,
}: {
  resourceStats: {
    name: string;
    hard: string;
    used: string;
  }[];
}) {
  const { t } = useTranslation();

  return (
    <SimpleTable
      data={resourceStats}
      columns={[
        {
          label: t('glossary|Resource'),
          getter: item => item.name,
        },
        {
          label: t('translation|Used'),
          getter: item => {
            const normalizedUnit = normalizeUnit(item.name, item.used);
            return compareUnits(item.used, normalizedUnit)
              ? normalizedUnit
              : `${item.used} (${normalizedUnit})`;
          },
        },
        {
          label: t('translation|Hard'),
          getter: item => {
            const normalizedUnit = normalizeUnit(item.name, item.hard);
            return compareUnits(item.hard, normalizedUnit)
              ? normalizedUnit
              : `${item.hard} (${normalizedUnit})`;
          },
        },
        {
          label: t('translation|Usage'),
          getter: item => <QuotaUsageBar name={item.name} used={item.used} hard={item.hard} />,
        },
      ]}
    />
  );
}

export default function ResourceQuotaDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <DetailsGrid
      resourceType={ResourceQuota}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: <ResourceQuotaTable resourceStats={item.resourceStats} />,
          },
        ]
      }
    />
  );
}
