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
  /** Text shown under the name, such as the source of the cluster */
  secondary?: string;
  /** Accent color for the circular icon background */
  accentColor?: string;
  /** Icon to display in the badge */
  icon?: string;
  /**
   * Text color for the name. Defaults to a near-black that stays readable on the
   * yellow "selected" sidebar background. The secondary text uses the same color
   * with reduced opacity.
   */
}

const ellipsisSx = {
  display: 'block',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * ClusterBadge displays an icon with a colored circle and cluster name.
 * Used in the sidebar to show selected clusters.
 *
 * Both lines are single-line and truncated with an ellipsis; the full text is
 * available through the native `title` tooltip.
 */
export default function ClusterBadge({ name, secondary, accentColor, icon }: ClusterBadgeProps) {
  const theme = useTheme();
  const iconColor = theme.palette.primary.main;
  const backgroundColor = theme.palette.secondary.main;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        minWidth: 0, // lets flex children shrink so ellipsis can kick in
        width: '100%',
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
            border: accentColor ? `2px solid ${accentColor}` : undefined,
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

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          title={name}
          sx={{
            ...ellipsisSx,
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {name}
        </Typography>
        {secondary && (
          <Typography variant="caption" color="text.secondary" title={secondary} sx={ellipsisSx}>
            {secondary}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
