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
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import React from 'react';
import { LightTooltip } from './Tooltip';

export interface ResourceStatusBadgeProps {
  /** The status level of the badge */
  status?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  /** The short text string to be shown on the badge */
  label: string;
  /** Optional icon override (e.g. iconify string) */
  icon?: string;
  /** Optional tooltip content (text or ReactNode) */
  tooltip?: React.ReactNode;
  /** Optional click handler */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export function ResourceStatusBadge(props: ResourceStatusBadgeProps) {
  const { status, label, icon, tooltip, onClick } = props;
  const theme = useTheme();

  // Pick default icon based on status if not provided
  let statusIcon = icon;
  if (statusIcon === undefined) {
    if (status === 'success') {
      statusIcon = 'mdi:check-circle';
    } else if (status === 'warning') {
      statusIcon = 'mdi:alert';
    } else if (status === 'error') {
      statusIcon = 'mdi:alert-circle';
    } else if (status === 'info') {
      statusIcon = 'mdi:information';
    }
  }

  // Determine standard colors to match theme
  const isLight = theme.palette.mode === 'light';
  const colorMap = {
    success: theme.palette.success,
    warning: theme.palette.warning,
    error: theme.palette.error,
    info: theme.palette.info,
  };

  let chipStyles = {};
  if (status && status in colorMap) {
    const palette = colorMap[status as keyof typeof colorMap];
    const baseColor = palette.main;
    if (isLight) {
      chipStyles = {
        backgroundColor: alpha(baseColor, 0.15),
        color: palette.dark || baseColor,
        border: `1px solid ${alpha(baseColor, 0.3)}`,
      };
    } else {
      chipStyles = {
        backgroundColor: alpha(baseColor, 0.2),
        color: palette.light || baseColor,
        border: `1px solid ${alpha(baseColor, 0.4)}`,
      };
    }
  } else {
    chipStyles = {
      backgroundColor: theme.palette.background.muted,
      color: theme.palette.text.primary,
      border: `1px solid ${theme.palette.divider}`,
    };
  }

  const chip = (
    <Chip
      size="small"
      label={label}
      icon={
        statusIcon ? (
          <Icon
            icon={statusIcon}
            style={{ color: 'inherit', marginLeft: '4px', marginRight: '-4px' }}
            width="14"
            height="14"
          />
        ) : undefined
      }
      onClick={onClick}
      tabIndex={tooltip ? 0 : undefined}
      sx={{
        fontSize: '0.75rem',
        fontWeight: 600,
        height: '20px',
        cursor: onClick ? 'pointer' : 'default',
        '& .MuiChip-label': {
          paddingLeft: '6px',
          paddingRight: '6px',
        },
        ...chipStyles,
      }}
    />
  );

  if (tooltip) {
    return (
      <LightTooltip title={tooltip} interactive>
        {chip}
      </LightTooltip>
    );
  }

  return chip;
}
