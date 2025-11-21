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
import React, { ReactNode } from 'react';
import CopyButton from './Resource/CopyButton';

export interface CopyLabelProps {
  /** The text to copy when the copy button is clicked */
  textToCopy: string;
  /** The content to display (can be different from textToCopy) */
  children: ReactNode;
}

/**
 * A component that displays content with a copy button that appears on hover.
 * This is useful for values that users may want to copy, like IPs, resource names, etc.
 */
export default function CopyLabel({ textToCopy, children }: CopyLabelProps) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        '&:hover .copy-button': {
          opacity: 1,
        },
      }}
    >
      <Box component="span">{children}</Box>
      <Box
        className="copy-button"
        component="span"
        sx={{
          opacity: 0,
          transition: 'opacity 0.2s',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <CopyButton text={textToCopy} buttonStyle="icon" />
      </Box>
    </Box>
  );
}
