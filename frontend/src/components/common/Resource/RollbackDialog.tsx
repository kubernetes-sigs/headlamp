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
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RevisionInfo } from '../../../lib/k8s/rollback';
import { DateLabel } from '../Label';

interface RollbackDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** The kind of resource (e.g. "Deployment") */
  resourceKind: string;
  /** The name of the resource */
  resourceName: string;
  /** Function to fetch revision history */
  getRevisionHistory: () => Promise<RevisionInfo[]>;
  /** Callback when dialog is closed (cancelled) */
  onClose: () => void;
  /** Callback when user confirms rollback with selected revision (undefined = previous) */
  onConfirm: (toRevision?: number) => void;
}

/**
 * RollbackDialog component that shows revision history and allows
 * the user to select a specific revision to rollback to.
 */
export default function RollbackDialog(props: RollbackDialogProps) {
  const { open, resourceKind, resourceName, getRevisionHistory, onClose, onConfirm } = props;
  const { t } = useTranslation(['translation']);

  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;
    setLoading(true);
    setError(null);
    setSelectedRevision(undefined);

    getRevisionHistory()
      .then(history => {
        if (!isActive) {
          return;
        }
        setRevisions(history);
        const nonCurrent = history.filter(r => !r.isCurrent);
        if (nonCurrent.length > 0) {
          setSelectedRevision(nonCurrent[0].revision);
        }
        setLoading(false);
      })
      .catch(err => {
        if (!isActive) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [open, getRevisionHistory]);

  function handleConfirm() {
    onConfirm(selectedRevision);
  }

  const hasMultipleRevisions = revisions.filter(r => !r.isCurrent).length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('translation|Rollback {{ kind }}', { kind: resourceKind })}</DialogTitle>
      <DialogContent>
        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t('translation|Loading revision history…')}
          </Typography>
        )}
        {error && (
          <Typography variant="body2" color="error" sx={{ py: 2 }}>
            {t('translation|Failed to load revision history: {{ error }}', { error })}
          </Typography>
        )}
        {!loading && !error && (
          <>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t(
                'translation|Select a revision to rollback "{{ name }}" to. This will replace the current pod template with the one from the selected revision.',
                { name: resourceName }
              )}
            </Typography>
            {!hasMultipleRevisions ? (
              <Typography variant="body2" color="text.secondary">
                {t('translation|No previous revisions available to rollback to.')}
              </Typography>
            ) : (
              <List sx={{ maxHeight: 320, overflow: 'auto' }}>
                {revisions.map(rev => (
                  <ListItemButton
                    key={rev.revision}
                    selected={selectedRevision === rev.revision}
                    onClick={() => {
                      if (!rev.isCurrent) {
                        setSelectedRevision(rev.revision);
                      }
                    }}
                    disabled={rev.isCurrent}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      border: '1px solid',
                      borderColor: selectedRevision === rev.revision ? 'primary.main' : 'divider',
                    }}
                  >
                    <Radio
                      checked={selectedRevision === rev.revision}
                      disabled={rev.isCurrent}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight="medium">
                            {t('translation|Revision {{ revision }}', {
                              revision: rev.revision,
                            })}
                          </Typography>
                          {rev.isCurrent && (
                            <Chip
                              label={t('translation|Current')}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box component="span">
                          <Typography variant="caption" color="text.secondary" component="span">
                            <DateLabel date={rev.createdAt} />
                          </Typography>
                          {rev.images.length > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              component="span"
                              sx={{ display: 'block' }}
                            >
                              {rev.images.map((img, i) => (
                                <Box key={i} component="span" sx={{ display: 'block' }}>
                                  {img}
                                </Box>
                              ))}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('translation|Cancel')}</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          disabled={!hasMultipleRevisions || selectedRevision === undefined || loading}
        >
          {t('translation|Rollback')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
