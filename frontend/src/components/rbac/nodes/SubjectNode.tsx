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
import { SubjectNodeData } from '../types';

function getSubjectIcon(kind: string): string {
  switch (kind) {
    case 'ServiceAccount':
      return 'mdi:account-lock';
    case 'Group':
      return 'mdi:group';
    default:
      return 'mdi:account';
  }
}

export const SubjectNode = memo(({ data }: { data: SubjectNodeData }) => {
  const { subject } = data;
  const { t } = useTranslation();

  return (
    <Paper
      elevation={3}
      sx={theme => ({
        padding: '12px 16px',
        minWidth: 240,
        maxWidth: 280,
        borderRadius: '12px',
        border: `2px solid ${theme.palette.primary.main}`,
        backgroundColor: theme.palette.background.paper,
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 4px 12px rgba(0, 0, 0, 0.4)'
            : '0 4px 12px rgba(0, 0, 0, 0.08)',
        position: 'relative',
      })}
    >
      <Box display="flex" alignItems="center" gap={1} mb={0.75}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          sx={theme => ({
            width: 32,
            height: 32,
            borderRadius: '8px',
            backgroundColor: theme.palette.primary.light + '33',
            color: theme.palette.primary.main,
          })}
        >
          <Icon icon={getSubjectIcon(subject.kind)} width={20} height={20} />
        </Box>
        <Box flex={1} overflow="hidden">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}
          >
            {t(subject.kind)}
          </Typography>
          <Typography
            variant="subtitle2"
            fontWeight={700}
            noWrap
            title={subject.name}
            sx={{ fontSize: '0.95rem' }}
          >
            {subject.name}
          </Typography>
        </Box>
      </Box>

      {subject.namespace && (
        <Chip
          label={`ns: ${subject.namespace}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem', height: 22 }}
        />
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          backgroundColor: '#1976d2',
          border: '2px solid #fff',
        }}
      />
    </Paper>
  );
});

export default SubjectNode;
