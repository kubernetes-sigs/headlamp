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
import type { ReactNode } from 'react';
import CopyButton from './CopyButton';

export interface CopyableCellProps {
  /** The text value to copy to clipboard */
  value: string;
  /** The content to display in the cell */
  children: ReactNode;
}

/**
 * A wrapper component that adds a copy-to-clipboard button on hover.
 * Used for table cells containing values that users commonly need to copy,
 * such as IP addresses, hostnames, etc.
 */
export default function CopyableCell({ value, children }: CopyableCellProps) {
  if (!value) {
    return <>{children}</>;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        '& .copy-button': {
          opacity: 0,
          transition: 'opacity 0.2s',
        },
        '&:hover .copy-button, &:focus-within .copy-button, & .copy-button:focus-visible': {
          opacity: 1,
        },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      <CopyButton
        text={value}
        onClick={event => event.stopPropagation()}
        width="16"
        iconButtonProps={{
          className: 'copy-button',
          size: 'small',
          sx: { padding: '2px', flexShrink: 0 },
        }}
      />
    </Box>
  );
}
