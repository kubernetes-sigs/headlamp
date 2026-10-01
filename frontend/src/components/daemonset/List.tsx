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
import DaemonSet from '../../lib/k8s/daemonSet';
import { MetadataDictGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export default function DaemonSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Daemon Sets')}
      resourceClass={DaemonSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'pods',
          label: t('Pods'),
          getValue: daemonSet => daemonSet.status?.currentNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'currentPods',
          label: t('translation|Current'),
          getValue: daemonSet => daemonSet.status?.currentNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'desiredPods',
          label: t('translation|Desired', { context: 'pods' }),
          getValue: daemonSet => daemonSet.status?.desiredNumberScheduled || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'readyPods',
          label: t('translation|Ready'),
          getValue: daemonSet => daemonSet.status?.numberReady || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'nodeSelector',
          label: t('Node Selector'),
          gridTemplate: 1,
          cellProps: {
            sx: { minWidth: 0, overflow: 'hidden' },
          },
          getValue: daemonSet =>
            Object.entries(daemonSet.spec?.template?.spec?.nodeSelector ?? {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${k}=${v}`)
              .join(', '),
          render: daemonSet => {
            const nodeSelector = daemonSet.spec?.template?.spec?.nodeSelector;
            if (!nodeSelector) return null;
            const entries = Object.entries(nodeSelector).sort(([a], [b]) => a.localeCompare(b));
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
                  tabIndex={0}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'flex-start',
                    flexDirection: 'column',
                    gap: 0.5,
                    minWidth: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                    <MetadataDictGrid
                      dict={visibleDict}
                      truncateLimit={10}
                      disableEntryTooltip
                      gridProps={{
                        sx: {
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                          minWidth: 0,
                          maxWidth: '100%',
                          overflow: 'hidden',
                        },
                      }}
                    />
                  </Box>
                  {hiddenCount > 0 && (
                    <Typography
                      component="span"
                      variant="body2"
                      noWrap
                      sx={theme => ({
                        color: theme.palette.text.secondary,
                        fontSize: theme.typography.pxToRem(12),
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
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
        {
          id: 'containers',
          label: t('Containers'),
          getValue: daemonSet =>
            daemonSet
              .getContainers()
              .map((c: KubeContainer) => c.name)
              .join(', '),
          render: daemonSet => {
            const containerNames = daemonSet.getContainers().map((c: KubeContainer) => c.name);
            const containerText = containerNames.join(', ');
            const containerTooltip = containerNames.join('\n');
            return (
              <LightTooltip title={containerTooltip} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'images',
          label: t('Images'),
          getValue: daemonSet =>
            daemonSet
              .getContainers()
              .map((c: KubeContainer) => c.image)
              .join(', '),
          render: daemonSet => {
            const images = daemonSet.getContainers().map((c: KubeContainer) => c.image);
            const imageTooltip = images.join('\n');
            const imageText = images.join(', ');
            return (
              <LightTooltip title={imageTooltip} interactive>
                {imageText}
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
