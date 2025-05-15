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

import Tooltip, { TooltipProps } from '@mui/material/Tooltip';
import { ReactElement, ReactNode } from 'react';

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

  if (typeof children === 'string') {
    return (
      <Tooltip
        disableInteractive={disableInteractive}
        sx={theme => ({
          backgroundColor: theme.palette.background.default,
          color: theme.palette.resourceToolTip.color,
          boxShadow: theme.shadows[1],
          fontSize: '1rem',
          whiteSpace: 'pre-line',
        })}
        {...rest}
      >
        <span>{children}</span>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      {...rest}
      // children prop in the mui Tooltip is defined as ReactElement which is not totally correct
      // string should be a valid child and is used a lot in this project
      // but it's not included in the ReactElement type
      children={props.children as unknown as ReactElement}
    />
  );
}
