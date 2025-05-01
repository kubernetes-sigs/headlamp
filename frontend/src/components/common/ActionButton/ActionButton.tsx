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

import { Icon, IconifyIcon, IconProps } from '@iconify/react';
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material';
import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';

export type ButtonStyle = 'action' | 'menu';

export interface ActionButtonProps {
  /** A short description of the action. */
  description: string;
  /** Either a string icon, or imported icon. */
  icon: string | IconifyIcon;
  /** The action when it's activated. */
  onClick: React.MouseEventHandler<HTMLElement>;
  /** A longer description of the action. Used in the tooltip. */
  longDescription?: string;
  /** The icon color. */
  color?: string | 'inherit' | 'primary' | 'secondary' | 'default';
  /** The icon width. */
  width?: IconProps['width'];
  /**
   * If given, uses a negative margin to counteract the padding on one side
   * (this is often helpful for aligning the left or right side of the icon
   * with content above or below, without ruining the border size and shape).
   */
  edge?: false | 'end' | 'start' | undefined;
  buttonStyle?: ButtonStyle;
  iconButtonProps?: IconButtonProps;
  iconProps?: IconProps;
}

/**
 * To be used for our Action buttons.
 *
 * So we implement them consistently and encapsulate the implementation.
 */
export default function ActionButton({
  description,
  longDescription,
  icon,
  onClick,
  color,
  width,
  edge,
  iconButtonProps,
  iconProps,
  buttonStyle = 'action',
}: ActionButtonProps) {
  if (buttonStyle === 'menu') {
    return (
      <MenuItem onClick={onClick}>
        <ListItemIcon>
          <Icon icon={icon} color={color} width={width} {...iconProps} />
        </ListItemIcon>
        <ListItemText>{longDescription || description}</ListItemText>
      </MenuItem>
    );
  }
  return (
    <Tooltip title={longDescription || description}>
      <IconButton
        aria-label={description}
        onClick={onClick}
        edge={edge}
        size="medium"
        {...iconButtonProps}
      >
        <Icon icon={icon} color={color} width={width} {...iconProps} />
      </IconButton>
    </Tooltip>
  );
}
