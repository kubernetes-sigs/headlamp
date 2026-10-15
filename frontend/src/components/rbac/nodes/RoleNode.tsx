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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Handle, Position } from '@xyflow/react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath } from 'react-router';
import { Link as RouterLink } from 'react-router-dom';
import { getCluster, getClusterPrefixedPath } from '../../../lib/cluster';
import { RoleNodeData } from '../types';

export const RoleNode = memo(({ data }: { data: RoleNodeData }) => {
  const { name, namespace, isClusterRole, rulesCount } = data;
  const { t } = useTranslation('glossary');

  const cluster = getCluster();
  const rawPath = isClusterRole ? '/clusterroles/:name' : '/roles/:namespace/:name';
  const routeURL = cluster
    ? generatePath(getClusterPrefixedPath(rawPath), {
        cluster,
        namespace: namespace ?? '',
        name,
      })
    : generatePath(rawPath, { namespace: namespace ?? '', name });

  return (
    <Paper
      elevation={2}
      sx={theme => ({
        padding: '12px 14px',
        minWidth: 230,
        maxWidth: 270,
        borderRadius: '10px',
        border: `1.5px solid ${
          isClusterRole ? theme.palette.warning.main : theme.palette.success.main
        }`,
        backgroundColor: theme.palette.background.paper,
        position: 'relative',
      })}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 9,
          height: 9,
          backgroundColor: isClusterRole ? '#ed6c02' : '#2e7d32',
          border: '2px solid #fff',
        }}
      />

      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Icon icon={isClusterRole ? 'mdi:shield-alert' : 'mdi:shield-key'} width={18} height={18} />
        <Box flex={1} overflow="hidden">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.7rem' }}
          >
            {isClusterRole ? t('ClusterRole') : t('Role')}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={700}
            noWrap
            title={name}
            component={RouterLink}
            to={routeURL}
            sx={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {name}
          </Typography>
        </Box>
      </Box>

      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
        <Chip
          label={isClusterRole ? t('Cluster-wide') : `ns: ${namespace}`}
          size="small"
          color={isClusterRole ? 'warning' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.72rem', height: 20 }}
        />
        <Chip
          label={t('{{count}} rules', { count: rulesCount, defaultValue: `${rulesCount} rules` })}
          size="small"
          variant="filled"
          sx={{ fontSize: '0.72rem', height: 20 }}
        />
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 9,
          height: 9,
          backgroundColor: isClusterRole ? '#ed6c02' : '#2e7d32',
          border: '2px solid #fff',
        }}
      />
    </Paper>
  );
});

export default RoleNode;
