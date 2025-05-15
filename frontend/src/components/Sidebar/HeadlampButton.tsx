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
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { styled } from '@mui/system';
import { useTranslation } from 'react-i18next';
import { getThemeName } from '../../lib/themes';
import { AppLogo } from '../App/AppLogo';

export interface HeadlampButtonProps {
  /** If the sidebar is fully expanded open or shrunk. */
  open: boolean;
  /** Only show if we are in mobile breakpoint and not open. */
  mobileOnly?: boolean;
  /** Called when sidebar toggles between open and closed. */
  onToggleOpen: () => void;
  /** Whether the button is to be disabled or not. */
  disabled?: boolean;
}

const StyledIcon = styled(Icon)`
  margin-right: ${({ theme }) => theme.spacing(1)};
`;

export default function HeadlampButton({
  open,
  onToggleOpen,
  mobileOnly,
  disabled = false,
}: HeadlampButtonProps) {
  const isSmall = useMediaQuery('(max-width:600px)');
  const { t } = useTranslation();

  if (mobileOnly && (!isSmall || (isSmall && open))) {
    return null;
  }

  return (
    <Box>
      <Button
        onClick={onToggleOpen}
        sx={theme => ({
          padding: isSmall && !open ? `10px 10px` : '6px 8px',
          color: theme.palette.text.primary,
        })}
        aria-label={open ? t('Shrink sidebar') : t('Expand sidebar')}
        disabled={disabled}
      >
        <StyledIcon icon={open ? 'mdi:backburger' : 'mdi:menu'} width="1.5rem" />
        <AppLogo
          logoType={'large'}
          themeName={getThemeName()}
          sx={{
            height: '32px',
            width: 'auto',
          }}
        />
      </Button>
    </Box>
  );
}
