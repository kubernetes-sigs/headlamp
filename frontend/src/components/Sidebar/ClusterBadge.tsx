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
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';

export interface ClusterBadgeProps {
  /** Cluster display name */
  name: string;
  /** Accent color for the badge border/background */
  accentColor?: string;
  /** Icon to display in the badge */
  icon?: string;
}

/**
 * ClusterBadge displays a small colored box with cluster name and icon
 * Used in the sidebar to show selected clusters
 */
export default function ClusterBadge({ name, accentColor, icon }: ClusterBadgeProps) {
  const defaultIcon = 'mdi:hexagon-multiple-outline';

  return (
    <Box
      sx={theme => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '6px 12px',
        borderRadius: 1,
        backgroundColor: alpha(theme.palette.secondary.main, 0.9),
      })}
    >
      <Icon
        icon={icon || defaultIcon}
        width={16}
        height={16}
        style={{ color: accentColor || 'currentColor' }}
      />
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'text.primary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Typography>
    </Box>
  );
}
