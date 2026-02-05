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
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { timeAgo } from '../../../lib/util';
import { DialogTitle } from '../Dialog';

export type RevisionHistoryEntry = {
  number: number;
  name: string;
  created: string;
  reason?: string;
  active: boolean;
};

interface RevisionPickerDialogProps {
  visible: boolean;
  resourceName: string;
  revisionList: RevisionHistoryEntry[];
  selectedRev: number | null;
  onRevisionClick: (rev: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RevisionPickerDialog(props: RevisionPickerDialogProps) {
  const { visible, resourceName, revisionList, selectedRev, onRevisionClick, onCancel, onConfirm } =
    props;
  const { t } = useTranslation(['translation']);

  const hasNoHistory = revisionList.length === 0;
  const canProceed = selectedRev !== null && !hasNoHistory;

  return (
    <MuiDialog open={visible} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{t('translation|Select Revision to Rollback')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          {t('translation|Choose a revision to rollback {{ itemName }} to:', {
            itemName: resourceName,
          })}
        </Typography>
        {hasNoHistory ? (
          <Typography variant="body2" color="error">
            {t('translation|No revision history available')}
          </Typography>
        ) : (
          <List sx={{ bgcolor: 'background.paper' }}>
            {revisionList.map(entry => {
              const isChosen = selectedRev === entry.number;
              const cantSelect = entry.active;

              return (
                <ListItem key={entry.number} disablePadding>
                  <ListItemButton
                    selected={isChosen}
                    onClick={() => onRevisionClick(entry.number)}
                    disabled={cantSelect}
                  >
                    <ListItemText
                      primary={
                        <Box>
                          <Typography component="span" variant="subtitle1" fontWeight="bold">
                            Revision {entry.number}
                            {entry.active && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="primary"
                                sx={{ ml: 1 }}
                              >
                                (current)
                              </Typography>
                            )}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            {timeAgo(entry.created)}
                          </Typography>
                          {entry.reason && (
                            <Typography variant="caption" color="textSecondary">
                              {entry.reason}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="secondary" variant="contained">
          {t('Cancel')}
        </Button>
        <Button onClick={onConfirm} color="primary" variant="contained" disabled={!canProceed}>
          {t('Rollback')}
        </Button>
      </DialogActions>
    </MuiDialog>
  );
}
