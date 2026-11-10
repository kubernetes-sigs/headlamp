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

import { Box } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import type { ComponentProps, MouseEventHandler } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ActionButton, { ButtonStyle } from '../ActionButton';

interface CopyButtonProps {
  text?: string;
  buttonStyle?: ButtonStyle;
  iconButtonProps?: ComponentProps<typeof ActionButton>['iconButtonProps'];
  width?: ComponentProps<typeof ActionButton>['width'];
  onClick?: MouseEventHandler<HTMLElement>;
}

export default function CopyButton(props: CopyButtonProps) {
  const { text, buttonStyle, iconButtonProps, width, onClick } = props;
  const { t } = useTranslation(['translation']);
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(resetTimeoutRef.current);
  }, []);

  if (text === undefined || text === null || text === '') {
    return <></>;
  }

  const copyText = text;

  async function onCopy(event: Parameters<MouseEventHandler<HTMLElement>>[0]) {
    onClick?.(event);

    clearTimeout(resetTimeoutRef.current);

    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setCopied(false);
      console.error('Failed to copy to clipboard:', err);
    }
  }

  return (
    <>
      <ActionButton
        description={copied ? t('translation|Copied!') : t('translation|Copy to clipboard')}
        buttonStyle={buttonStyle}
        onClick={onCopy}
        icon={copied ? 'mdi:check' : 'mdi:content-copy'}
        iconButtonProps={iconButtonProps}
        width={width}
      />
      <Box role="status" aria-live="polite" aria-atomic="true" sx={visuallyHidden}>
        {copied ? t('translation|Copied!') : ''}
      </Box>
    </>
  );
}
