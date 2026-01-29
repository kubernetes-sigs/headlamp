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
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { MouseEvent } from 'react';
import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation(['translation']);
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <>{children}</>;
  }

  async function handleCopy(e: MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  const tooltipTitle = copied ? t('translation|Copied!') : t('translation|Copy to clipboard');

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
        '&:hover .copy-button': {
          opacity: 1,
        },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      <Tooltip title={tooltipTitle}>
        <IconButton
          className="copy-button"
          size="small"
          onClick={handleCopy}
          aria-label={t('translation|Copy to clipboard')}
          sx={{
            padding: '2px',
            flexShrink: 0,
          }}
        >
          <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} width="16" height="16" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
