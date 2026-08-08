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
import { htmlImagesToMarkdown } from './htmlImagesToMarkdown';

export interface ReleaseNotesModalProps {
  releaseNotes: string;
  appVersion: string | null;
  /**
   * Called when the dialog is dismissed (Escape, backdrop, or the close
   * button). `showReleaseNotes` below only controls this component's own
   * Dialog `open` prop; without this callback, closing the dialog had no
   * way to tell the parent, so `ReleaseNotes.tsx`'s `releaseNotes` state
   * stayed truthy forever and its update-available Snackbar (suppressed
   * while this dialog is open) never came back for the rest of the
   * session.
   */
  onClose?: () => void;
}

export default function ReleaseNotesModal(props: ReleaseNotesModalProps) {
  const { releaseNotes, appVersion, onClose } = props;
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(Boolean(releaseNotes));
  const { t } = useTranslation();
  const notesMarkdown = React.useMemo(() => htmlImagesToMarkdown(releaseNotes), [releaseNotes]);

  const handleClose = () => {
    setShowReleaseNotes(false);
    onClose?.();
  };

  return (
    <Dialog open={showReleaseNotes} maxWidth="xl" onClose={handleClose}>
      <DialogTitle
        focusTitle
        buttons={[
          <IconButton aria-label={t('Close')} onClick={handleClose}>
            <Icon icon="mdi:close" width="30" height="30" />
          </IconButton>,
        ]}
      >
        {t('translation|Release Notes ({{ appVersion }})', {
          appVersion: appVersion,
        })}
      </DialogTitle>
      {/* Scrollable content has no guaranteed focusable child (release notes
          often have no links), so without a tabIndex of its own, MUI's
          FocusTrap falls back to focusing the outer dialog container. That
          container is an ancestor of this element, but keyboard scrolling
          (PageDown, arrows) only acts on the focused element and its
          scrollable ancestors — never on an unrelated scrollable descendant
          — so nothing happened for a keyboard-only user. Making this element
          itself tabbable lets Tab reach it directly, and once it has focus,
          the browser scrolls it natively. */}
      <DialogContent dividers tabIndex={0} aria-label={t('translation|Release notes content')}>
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
            {notesMarkdown}
          </ReactMarkdown>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
