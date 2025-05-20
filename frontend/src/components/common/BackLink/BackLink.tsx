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
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';

export interface BackLinkProps {
  /** The location to go back to. If not provided, the browser's history will be used. */
  to?: string | ReturnType<typeof useLocation>;
}

export default function BackLink(props: BackLinkProps) {
  const { to: backLink = '' } = props;
  const { t } = useTranslation();
  const history = useHistory();

  // We only want to update when the backLink changes (not the history).
  React.useEffect(() => {}, [backLink]);

  return (
    <Button
      startIcon={<Icon icon="mdi:chevron-left" />}
      size="small"
      sx={theme => ({ color: theme.palette.primaryColor })}
      onClick={() => {
        // If there is no back link, go back in history.
        if (!backLink) {
          history.goBack();
          return;
        }

        history.push(backLink);
      }}
    >
      <Typography style={{ paddingTop: '3px' }}>{t('translation|Back')}</Typography>
    </Button>
  );
}
