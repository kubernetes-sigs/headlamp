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
import { SxProps, Theme } from '@mui/material/styles';
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

// TooltipLight is a custom wrapper around MUI's Tooltip component.
// It gives tooltips a light background, custom font size, and allows multi-line text using \n.
export default function TooltipLight(props: TooltipLightProps) {
  const { children, interactive = true, slotProps, componentsProps, ...rest } = props;
  const disableInteractive = !interactive;

  // Define our default light styling for the tooltip popover box.
  // Note: whiteSpace: 'pre-line' makes sure \n inside text creates new lines!
  const defaultSx = (theme: Theme) => ({
    backgroundColor: theme.palette.background.default,
    color: theme.palette.resourceToolTip.color,
    boxShadow: theme.shadows[1],
    fontSize: '1rem',
    whiteSpace: 'pre-line',
  });

  // Check if whoever called <TooltipLight /> passed their own slotProps.tooltip.sx styles.
  const callerTooltipProps = slotProps?.tooltip ?? componentsProps?.tooltip ?? {};
  const callerSx = callerTooltipProps.sx;

  // We use slotProps.tooltip.sx to apply styles directly to the tooltip box in MUI v5.
  // We merge our default light styles with any extra styles passed in by the caller.
  const mergedSlotProps: TooltipProps['slotProps'] = {
    ...slotProps,
    tooltip: {
      ...callerTooltipProps,
      sx: [defaultSx, ...(Array.isArray(callerSx) ? callerSx : [callerSx])] as SxProps<Theme>,
    } as any,
  };

  // If children is a plain string text, wrap it inside a <span> tag.
  // Otherwise, use the ReactElement child directly.
  const childrenNode =
    typeof children === 'string' ? <span>{children}</span> : (children as ReactElement);

  return (
    <Tooltip
      disableInteractive={disableInteractive}
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 0 }}
      slotProps={mergedSlotProps}
      {...rest}
      children={childrenNode}
    />
  );
}
