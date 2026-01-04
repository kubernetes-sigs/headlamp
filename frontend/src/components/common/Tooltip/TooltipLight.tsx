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

import Fade from '@mui/material/Fade';
import Tooltip, { TooltipProps } from '@mui/material/Tooltip';
import React, { ReactNode } from 'react';

export interface TooltipLightProps extends Omit<TooltipProps, 'children'> {
  /**
   * If true, the tooltip will be interactive. Defaults to true.
   *
   * If a tooltip is interactive, it will close when the user hovers over the tooltip before the leaveDelay is expired.
   */
  interactive?: boolean;
  children: ReactNode;
}

export default function TooltipLight(props: TooltipLightProps) {
  const { children, interactive = true, ...rest } = props;
  const disableInteractive = !interactive;

  // MUI Tooltip needs to attach a ref + event handlers to its child.
  // Wrapping guarantees the child can always hold a ref and props.
  const tooltipChild = <span style={{ display: 'inline-flex' }}>{children}</span>;

  if (typeof children === 'string') {
    return (
      <Tooltip
        disableInteractive={disableInteractive}
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 0 }}
        sx={theme => ({
          backgroundColor: theme.palette.background.default,
          color: theme.palette.resourceToolTip.color,
          boxShadow: theme.shadows[1],
          fontSize: '1rem',
          whiteSpace: 'pre-line',
        })}
        {...rest}
      >
        {tooltipChild}
      </Tooltip>
    );
  }

  return (
    <Tooltip
      disableInteractive={disableInteractive}
      {...rest}
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 0 }}
    >
      {tooltipChild}
    </Tooltip>
  );
}
