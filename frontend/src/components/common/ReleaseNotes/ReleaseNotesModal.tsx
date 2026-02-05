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
import { DialogTitle } from '../Dialog';

/**
 * Helper function to detect GitHub user-attachments video URLs
 * These are URLs that GitHub generates when users upload videos to issues/releases
 * Format: https://github.com/user-attachments/assets/{uuid}
 */
function isGitHubVideoUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/.test(trimmed);
}

/**
 * Custom component for rendering paragraphs that may contain GitHub video URLs
 */
function ParagraphWithVideo({ children }: { children?: React.ReactNode }) {
  // Check if this paragraph contains only a GitHub video URL
  const childrenArray = React.Children.toArray(children);

  if (childrenArray.length === 1 && typeof childrenArray[0] === 'string') {
    const text = childrenArray[0];
    if (isGitHubVideoUrl(text)) {
      return (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={text}
          controls
          style={{
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
          }}
        >
          Video content is not available in your browser. Please{' '}
          <a href={text} target="_blank" rel="noopener noreferrer">
            view the video here
          </a>
          .
        </video>
      );
    }
  }

  return <p>{children}</p>;
}

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
              p: ParagraphWithVideo,
            }}
          >
            {releaseNotes}
          </ReactMarkdown>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
