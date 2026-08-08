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
import Typography, { TypographyProps } from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

type EmptyProps = React.PropsWithChildren<{
  color?: TypographyProps['color'];
  /**
   * Optional row of quick-action controls (e.g. "Refresh", "Create <Kind>")
   * rendered below the message so users have a next step from the empty
   * state. Pass `null` to explicitly render nothing.
   */
  actions?: React.ReactNode;
  /**
   * Accessible label for the actions row. Defaults to a generic
   * "Empty state actions" so screen readers relate the buttons to the
   * empty state; callers should override with something more specific
   * (e.g. "Empty pod list actions") when possible.
   */
  actionsAriaLabel?: string;
}>;

export default function Empty({
  color = 'textSecondary',
  children,
  actions,
  actionsAriaLabel,
}: EmptyProps) {
  const { t } = useTranslation();
  return (
    <Box padding={2}>
      {React.Children.map(children, child => {
        if (typeof child === 'string') {
          return (
            <Typography color={color} align="center">
              {child}
            </Typography>
          );
        }
        return child;
      })}
      {actions !== null && actions !== undefined && (
        <Box
          role="group"
          aria-label={actionsAriaLabel ?? t('translation|Empty state actions')}
          sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
