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
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Handle, Position } from '@xyflow/react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { RuleNodeData } from '../types';

function getVerbColor(verb: string): 'default' | 'primary' | 'warning' | 'error' | 'success' {
  switch (verb.toLowerCase()) {
    case '*':
    case 'delete':
    case 'deletecollection':
    case 'escalate':
    case 'bind':
      return 'error';
    case 'create':
    case 'update':
    case 'patch':
      return 'warning';
    case 'get':
    case 'list':
    case 'watch':
      return 'primary';
    default:
      return 'default';
  }
}

export const RuleNode = memo(({ data }: { data: RuleNodeData }) => {
  const { apiGroups, resources, verbs, resourceNames, nonResourceURLs } = data;
  const { t } = useTranslation();

  const renderedApiGroups =
    apiGroups && apiGroups.length > 0
      ? apiGroups.map(g => (g === '' ? 'core' : g)).join(', ')
      : 'core';

  return (
    <Paper
      elevation={2}
      tabIndex={0}
      role="region"
      aria-label={t('Rule details')}
      sx={theme => ({
        padding: '10px 14px',
        minWidth: 260,
        maxWidth: 320,
        maxHeight: 150,
        overflowY: 'auto',
        borderRadius: '10px',
        border: `1px solid ${theme.palette.divider}`,
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
          backgroundColor: '#757575',
          border: '2px solid #fff',
        }}
      />

      <Box mb={0.75}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontWeight: 600, fontSize: '0.7rem' }}
        >
          {t('API Group')}: {renderedApiGroups}
        </Typography>

        {resources && resources.length > 0 ? (
          <Box display="flex" flexWrap="wrap" gap={0.5} my={0.5}>
            {resources.map(res => (
              <Chip
                key={res}
                label={res}
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  height: 22,
                  borderColor: 'primary.main',
                }}
              />
            ))}
          </Box>
        ) : nonResourceURLs && nonResourceURLs.length > 0 ? (
          <Box display="flex" flexWrap="wrap" gap={0.5} my={0.5}>
            {nonResourceURLs.map(url => (
              <Chip
                key={url}
                label={url}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.75rem', height: 22 }}
              />
            ))}
          </Box>
        ) : null}

        {resourceNames && resourceNames.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontStyle: 'italic', fontSize: '0.7rem' }}
          >
            {t('Resource names')}: {resourceNames.join(', ')}
          </Typography>
        )}
      </Box>

      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
        {verbs &&
          verbs.map(v => (
            <Chip
              key={v}
              label={v}
              size="small"
              color={getVerbColor(v)}
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                height: 20,
              }}
            />
          ))}
      </Box>
    </Paper>
  );
});

export default RuleNode;
