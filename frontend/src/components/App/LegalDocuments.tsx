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
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';

/** Public metadata for a legal document provided by the desktop host. */
interface LegalDocument {
  /** Stable identifier used to request the document content. */
  id: string;
  /** Human-readable document title. */
  title: string;
}

/**
 * Lists legal documents exposed by the desktop host and displays their content.
 *
 * @returns Legal document controls, or nothing when the host lacks the capability.
 */
export default function LegalDocuments() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<LegalDocument | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const getLegalDocuments = window.desktopApi?.getLegalDocuments;
  const documentRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    getLegalDocuments?.()
      .then((items: LegalDocument[]) => {
        if (active) {
          setDocuments(items);
        }
      })
      .catch(() => {
        if (active) {
          setError(t('translation|Unable to load legal documents.'));
        }
      });
    return () => {
      active = false;
    };
  }, [getLegalDocuments, t]);

  useEffect(
    () => () => {
      documentRequestRef.current++;
    },
    []
  );

  /**
   * Requests and presents one legal document.
   *
   * @param document - Document selected by the user.
   * @returns A promise that settles after the host request is handled.
   */
  async function openDocument(document: LegalDocument): Promise<void> {
    const requestId = ++documentRequestRef.current;
    try {
      const result = await window.desktopApi?.getLegalDocument?.(document.id);
      if (requestId !== documentRequestRef.current) {
        return;
      }
      if (result?.success) {
        setSelectedDocument(document);
        setContent(result.content ?? '');
        setError('');
      } else {
        setError(result?.error ?? t('translation|Unable to load legal document.'));
      }
    } catch {
      if (requestId !== documentRequestRef.current) {
        return;
      }
      setError(t('translation|Unable to load legal document.'));
    }
  }

  /** Closes the document dialog and invalidates its pending request. */
  function closeDocument(): void {
    documentRequestRef.current++;
    setSelectedDocument(null);
  }

  if (!getLegalDocuments) {
    return null;
  }

  return (
    <Box sx={{ p: 2 }}>
      {documents.map(document => (
        <Button key={document.id} onClick={() => openDocument(document)}>
          {document.title}
        </Button>
      ))}
      {error && (
        <Typography role="alert" color="error">
          {error}
        </Typography>
      )}
      <Dialog
        maxWidth="lg"
        open={selectedDocument !== null}
        onClose={closeDocument}
        title={selectedDocument?.title ?? ''}
      >
        <DialogContent>
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              maxHeight: '70vh',
              overflow: 'auto',
            }}
          >
            {content}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDocument}>{t('translation|Close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
