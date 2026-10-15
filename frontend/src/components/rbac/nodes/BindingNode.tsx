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
import { BindingNodeData } from '../types';

export const BindingNode = memo(({ data }: { data: BindingNodeData }) => {
  const { name, namespace, isClusterRoleBinding, roleRefName, roleRefKind } = data;
  const { t } = useTranslation('glossary');

  const cluster = getCluster();
  const rawPath = isClusterRoleBinding
    ? '/clusterrolebinding/:name'
    : '/rolebinding/:namespace/:name';
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
          isClusterRoleBinding ? theme.palette.secondary.main : theme.palette.info.main
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
          backgroundColor: isClusterRoleBinding ? '#9c27b0' : '#0288d1',
          border: '2px solid #fff',
        }}
      />

      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Icon
          icon={isClusterRoleBinding ? 'mdi:shield-alert' : 'mdi:connection'}
          width={18}
          height={18}
        />
        <Box flex={1} overflow="hidden">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', fontWeight: 600, fontSize: '0.7rem' }}
          >
            {isClusterRoleBinding ? t('ClusterRoleBinding') : t('RoleBinding')}
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
          label={isClusterRoleBinding ? t('Cluster-wide') : `ns: ${namespace}`}
          size="small"
          color={isClusterRoleBinding ? 'secondary' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.72rem', height: 20 }}
        />
        <Chip
          label={`-> ${roleRefKind}: ${roleRefName}`}
          size="small"
          variant="filled"
          sx={{ fontSize: '0.72rem', height: 20, maxWidth: 170 }}
        />
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 9,
          height: 9,
          backgroundColor: isClusterRoleBinding ? '#9c27b0' : '#0288d1',
          border: '2px solid #fff',
        }}
      />
    </Paper>
  );
});

export default BindingNode;
