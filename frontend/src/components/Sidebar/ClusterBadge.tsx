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
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';

export interface ClusterBadgeProps {
  /** Cluster display name */
  name: string;
  /** Accent color for the circular icon background */
  accentColor?: string;
  /** Icon to display in the badge */
  icon?: string;
}

/**
 * ClusterBadge displays an icon with a colored circle and cluster name
 * Used in the sidebar to show selected clusters
 */
export default function ClusterBadge({ name, accentColor, icon }: ClusterBadgeProps) {
  const theme = useTheme();
  const iconColor = theme.palette.primary.main;
  const backgroundColor = theme.palette.secondary.main;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      {/* Colored circle with icon, only if icon is provided */}
      {icon && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor,
            border: `2px solid ${accentColor}`,
            flexShrink: 0,
          }}
        >
          <Icon
            icon={icon}
            color={iconColor}
            width={20}
            height={20}
            data-testid="cluster-badge-icon"
          />
        </Box>
      )}

      {/* Cluster name */}
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.875rem',
          fontWeight: 500,
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
