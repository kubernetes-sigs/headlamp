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
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { KubeContainer } from '../../lib/k8s/cluster';
import ReplicaSet from '../../lib/k8s/replicaSet';
import { MetadataDictGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export default function ReplicaSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Replica Sets')}
      resourceClass={ReplicaSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'generation',
          label: t('Generation'),
          getValue: replicaSet => replicaSet?.status?.observedGeneration,
          show: false,
        },
        {
          id: 'currentReplicas',
          label: t('translation|Current', { context: 'replicas' }),
          getValue: replicaSet => replicaSet?.status?.replicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'desiredReplicas',
          label: t('translation|Desired', { context: 'replicas' }),
          getValue: replicaSet => replicaSet?.spec?.replicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'readyReplicas',
          label: t('translation|Ready'),
          getValue: replicaSet => replicaSet?.status?.readyReplicas || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'containers',
          label: t('Containers'),
          getValue: replicaSet =>
            replicaSet
              .getContainers()
              .map(c => c.name)
              .join(''),
          render: replicaSet => {
            const containerText = replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.name)
              .join('\n');
            if (!containerText) return null;
            return (
              <LightTooltip title={containerText} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'images',
          label: t('Images'),
          getValue: replicaSet =>
            replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join(''),
          render: replicaSet => {
            const imageText = replicaSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join('\n');
            if (!imageText) return null;
            return (
              <LightTooltip title={imageText} interactive>
                {imageText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'selector',
          label: t('Selector'),
          getValue: replicaSet => {
            const matchLabels = replicaSet.spec?.selector?.matchLabels;
            if (!matchLabels) return '';
            return Object.entries(matchLabels)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
          },
          render: replicaSet => {
            const matchLabels = replicaSet.spec?.selector?.matchLabels;
            if (!matchLabels) return null;
            const entries = Object.entries(matchLabels).sort(([a], [b]) => a.localeCompare(b));
            if (entries.length === 0) return null;
            const maxVisible = 2;
            const hiddenCount = Math.max(entries.length - maxVisible, 0);
            const visibleDict = Object.fromEntries(entries.slice(0, maxVisible));
            const tooltipText = entries.map(([k, v]) => `${k}: ${v}`).join('\n');
            return (
              <LightTooltip
                title={<span style={{ whiteSpace: 'pre-line' }}>{tooltipText}</span>}
                interactive
                sx={theme => ({
                  backgroundColor: theme.palette.background.default,
                  color: theme.palette.resourceToolTip.color,
                  boxShadow: theme.shadows[1],
                  fontSize: '1rem',
                  whiteSpace: 'pre-line',
                })}
              >
                <Box
                  component="div"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexWrap: 'nowrap',
                    gap: 0.5,
                  }}
                >
                  <Box sx={{ display: 'inline-block' }}>
                    <MetadataDictGrid
                      dict={visibleDict}
                      truncateLimit={10}
                      disableEntryTooltip
                      gridProps={{ sx: { display: 'flex', flexWrap: 'nowrap', gap: 0.5 } }}
                    />
                  </Box>
                  {hiddenCount > 0 && (
                    <Typography
                      component="span"
                      variant="body2"
                      tabIndex={0}
                      sx={theme => ({
                        color: theme.palette.text.secondary,
                        fontSize: theme.typography.pxToRem(12),
                      })}
                    >
                      {t('translation|more_count', { count: hiddenCount })}
                    </Typography>
                  )}
                </Box>
              </LightTooltip>
            );
          },
        },
        'labels',
        'age',
      ]}
    />
  );
}
