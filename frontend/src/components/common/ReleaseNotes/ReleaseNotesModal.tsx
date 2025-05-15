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
import { Box, Dialog, DialogContent, IconButton, Link } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { DialogTitle } from '../Dialog';

export interface ReleaseNotesModalProps {
  releaseNotes: string;
  appVersion: string | null;
}

export default function ReleaseNotesModal(props: ReleaseNotesModalProps) {
  const { releaseNotes, appVersion } = props;
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(Boolean(releaseNotes));
  const { t } = useTranslation();

  return (
    <Dialog open={showReleaseNotes} maxWidth="xl">
      <DialogTitle
        buttons={[
          <IconButton aria-label={t('Close')} onClick={() => setShowReleaseNotes(false)}>
            <Icon icon="mdi:close" width="30" height="30" />
          </IconButton>,
        ]}
      >
        {t('translation|Release Notes ({{ appVersion }})', {
          appVersion: appVersion,
        })}
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            img: {
              display: 'block',
              maxWidth: '100%',
            },
          }}
        >
          <ReactMarkdown
            components={{
              a: ({ children, href }) => {
                return (
                  <Link href={href} target="_blank">
                    {children}
                  </Link>
                );
              },
            }}
          >
            {releaseNotes}
          </ReactMarkdown>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
