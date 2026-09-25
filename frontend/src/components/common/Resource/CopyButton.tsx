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
import { Box, Button } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import type { ComponentProps, MouseEventHandler } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ActionButton, { ButtonStyle } from '../ActionButton';

interface CopyButtonProps {
  /**
   * The text to copy, or a function that resolves it asynchronously (e.g. when the
   * content has to be fetched before it can be copied). A resolved value that is
   * falsy is treated as "nothing to copy" and no clipboard write is attempted.
   */
  text?: string | (() => Promise<string | null | undefined>);
  /** 'wide' renders a full labelled button instead of the icon-only/menu-item styles. */
  buttonStyle?: ButtonStyle | 'wide';
  /** Overrides the default "Copy to clipboard" description/label. */
  description?: string;
  iconButtonProps?: ComponentProps<typeof ActionButton>['iconButtonProps'];
  width?: ComponentProps<typeof ActionButton>['width'];
  /** Extra props forwarded to the underlying Button when buttonStyle is 'wide'. */
  buttonProps?: ComponentProps<typeof Button>;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Called after a successful copy. */
  onCopied?: () => void;
  /** Called if resolving `text` or writing it to the clipboard fails. */
  onError?: (err: unknown) => void;
}

export default function CopyButton(props: CopyButtonProps) {
  const {
    text,
    buttonStyle = 'action',
    description,
    iconButtonProps,
    width,
    buttonProps,
    onClick,
    onCopied,
    onError,
  } = props;
  const { t } = useTranslation(['translation']);
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(resetTimeoutRef.current);
  }, []);

  if (typeof text !== 'function' && (text === undefined || text === null || text === '')) {
    return <></>;
  }

  async function onCopy(event: Parameters<MouseEventHandler<HTMLElement>>[0]) {
    onClick?.(event);

    clearTimeout(resetTimeoutRef.current);

    try {
      const copyText = typeof text === 'function' ? await text() : text;
      if (!copyText) {
        return;
      }
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      onCopied?.();
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setCopied(false);
      console.error('Failed to copy to clipboard:', err);
      onError?.(err);
    }
  }

  const statusBox = (
    <Box role="status" aria-live="polite" aria-atomic="true" sx={visuallyHidden}>
      {copied ? t('translation|Copied!') : ''}
    </Box>
  );

  if (buttonStyle === 'wide') {
    return (
      <>
        <Button
          variant="outlined"
          startIcon={<Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} />}
          onClick={onCopy}
          {...buttonProps}
        >
          {copied ? t('translation|Copied!') : description ?? t('translation|Copy to clipboard')}
        </Button>
        {statusBox}
      </>
    );
  }

  return (
    <>
      <ActionButton
        description={
          copied ? t('translation|Copied!') : description ?? t('translation|Copy to clipboard')
        }
        buttonStyle={buttonStyle}
        onClick={onCopy}
        icon={copied ? 'mdi:check' : 'mdi:content-copy'}
        iconButtonProps={iconButtonProps}
        width={width}
      />
      {statusBox}
    </>
  );
}
