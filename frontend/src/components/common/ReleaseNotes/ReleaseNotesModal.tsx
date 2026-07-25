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
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
            '& img': { display: 'block', maxWidth: '100%', height: 'auto' },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              marginBottom: 2,
            },
            '& th, & td': {
              border: '1px solid',
              borderColor: 'divider',
              padding: '6px 12px',
              textAlign: 'left',
            },
            '& th': { backgroundColor: 'action.hover', fontWeight: 'bold' },
            '& tr:nth-of-type(even)': { backgroundColor: 'action.hover' },
            '& code': {
              fontFamily: 'monospace',
              backgroundColor: 'action.hover',
              padding: '2px 4px',
              borderRadius: 1,
              fontSize: '0.875em',
            },
            '& pre': {
              backgroundColor: 'action.hover',
              padding: 2,
              borderRadius: 1,
              overflow: 'auto',
              '& code': { backgroundColor: 'transparent', padding: 0 },
            },
            '& blockquote': {
              borderLeft: '4px solid',
              borderColor: 'divider',
              margin: 0,
              paddingLeft: 2,
              color: 'text.secondary',
            },
            '& h1, & h2, & h3, & h4, & h5, & h6': { marginTop: 2, marginBottom: 1 },
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, href }) => (
                <Link href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </Link>
              ),
            }}
          >
            {releaseNotes}
          </ReactMarkdown>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
