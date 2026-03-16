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
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { formatShortcutKey } from '../../../lib/useShortcut';
import { useTypedSelector } from '../../../redux/hooks';
import {
  resetAllShortcuts,
  resetShortcut,
  setShortcut,
  setShortcutsDialogOpen,
  ShortcutConfig,
} from '../../../redux/shortcutsSlice';
import { Dialog } from '../../common/Dialog';
import NameValueTable from '../../common/NameValueTable';

interface ShortcutEditorProps {
  shortcut: ShortcutConfig;
  isEditing: boolean;
  checkConflict?: (key: string) => string | undefined;
  onStartEdit: () => void;
  onSave: (key: string) => void;
  onCancel: () => void;
  onReset: () => void;
}

function ShortcutEditor({
  shortcut,
  isEditing,
  checkConflict,
  onStartEdit,
  onSave,
  onCancel,
  onReset,
}: ShortcutEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [recordedKey, setRecordedKey] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setRecordedKey('');
      setIsRecording(true);
    } else {
      setIsRecording(false);
      setRecordedKey('');
    }
  }, [isEditing]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isRecording) return;

      event.preventDefault();
      event.stopPropagation();

      const key = event.key.toLowerCase();

      if (['control', 'shift', 'alt', 'meta'].includes(key)) {
        return;
      }

      if (key === 'escape') {
        onCancel();
        return;
      }

      const parts: string[] = [];
      if (event.ctrlKey) parts.push('ctrl');
      if (event.shiftKey) parts.push('shift');
      if (event.altKey) parts.push('alt');
      if (event.metaKey) parts.push('meta');

      let keyName = key;
      if (key === ' ') keyName = 'space';
      if (key === 'arrowup') keyName = 'ArrowUp';
      if (key === 'arrowdown') keyName = 'ArrowDown';
      if (key === 'arrowleft') keyName = 'ArrowLeft';
      if (key === 'arrowright') keyName = 'ArrowRight';

      parts.push(keyName);
      const newKey = parts.join('+');

      setRecordedKey(newKey);
      setIsRecording(false);
    },
    [isRecording, onCancel]
  );

  const isModified = shortcut.key !== shortcut.defaultKey;
  const conflict = checkConflict && recordedKey ? checkConflict(recordedKey) : undefined;

  if (isEditing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: 150 }}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <TextField
            size="small"
            autoFocus // eslint-disable-line jsx-a11y/no-autofocus
            value={recordedKey ? formatShortcutKey(recordedKey) : ''}
            placeholder={isRecording ? t('Press keys...') : ''}
            onKeyDown={handleKeyDown}
            onClick={() => setIsRecording(true)}
            sx={{
              '& .MuiInputBase-input': {
                textAlign: 'center',
                cursor: 'default',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
              },
            }}
            InputProps={{
              readOnly: true,
              sx: {
                backgroundColor: isRecording ? alpha(theme.palette.warning.main, 0.1) : undefined,
                height: 32,
              },
            }}
          />
          {conflict && (
            <Typography variant="caption" color="error">
              {t('Conflicts with: {{name}}', { name: conflict })}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => onSave(recordedKey)}
            disabled={!recordedKey || !!conflict}
            sx={{ minWidth: 60 }}
          >
            {t('Save')}
          </Button>
          <Button size="small" onClick={onCancel} sx={{ minWidth: 60 }}>
            {t('Cancel')}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
      <Button
        onClick={onStartEdit}
        sx={{
          textTransform: 'none',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          fontWeight: 600,
          backgroundColor: isModified
            ? alpha(theme.palette.primary.main, 0.1)
            : theme.palette.background.muted,
          color: isModified ? theme.palette.primary.main : theme.palette.text.primary,
          border: '1px solid',
          borderColor: isModified ? theme.palette.primary.main : theme.palette.divider,
          borderRadius: '4px',
          px: 1,
          py: 0.5,
          minWidth: '60px',
          textAlign: 'center',
          boxShadow: `0 2px 0 ${theme.palette.divider}`,
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.2),
            borderColor: theme.palette.primary.main,
          },
        }}
      >
        {formatShortcutKey(shortcut.key)}
      </Button>
      {isModified && (
        <Tooltip title={t('Reset to default')}>
          <IconButton size="small" onClick={onReset}>
            <Icon icon="mdi:restore" width={16} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export function ShortcutsList() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const shortcuts = useTypedSelector(state => state.shortcuts.shortcuts);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSave = (id: string, key: string) => {
    dispatch(setShortcut({ id, key }));
    setEditingId(null);
  };

  const handleReset = (id: string) => {
    dispatch(resetShortcut(id));
  };

  const getConflict = useCallback(
    (currentId: string, newKey: string): string | undefined => {
      const lowerNewKey = newKey.toLowerCase();
      for (const id in shortcuts) {
        if (id !== currentId && shortcuts[id].key.toLowerCase() === lowerNewKey) {
          return shortcuts[id].name;
        }
      }
      return undefined;
    },
    [shortcuts]
  );

  const categories = ['search', 'navigation', 'general'];
  const groupedShortcuts = useMemo(
    () =>
      Object.values(shortcuts).reduce((acc, shortcut) => {
        const cat = shortcut.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(shortcut);
        return acc;
      }, {} as Record<string, ShortcutConfig[]>),
    [shortcuts]
  );

  const categoryLabels: Record<string, string> = useMemo(
    () => ({
      navigation: t('Navigation'),
      search: t('Search'),
      general: t('General'),
    }),
    [t]
  );

  const rows = categories.flatMap(cat => {
    if (!groupedShortcuts[cat]) return [];

    const categoryHeader = {
      name: (
        <Typography variant="button" sx={{ fontWeight: 'bold', letterSpacing: '0.1em' }}>
          {categoryLabels[cat] || cat}
        </Typography>
      ),
      withHighlightStyle: true,
      value: null,
    };

    const shortcutRows = groupedShortcuts[cat].map(shortcut => ({
      name: (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
            {shortcut.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {shortcut.description}
          </Typography>
        </Box>
      ),
      value: (
        <ShortcutEditor
          shortcut={shortcut}
          isEditing={editingId === shortcut.id}
          onStartEdit={() => setEditingId(shortcut.id)}
          onSave={key => handleSave(shortcut.id, key)}
          onCancel={() => setEditingId(null)}
          onReset={() => handleReset(shortcut.id)}
          checkConflict={
            editingId === shortcut.id ? key => getConflict(shortcut.id, key) : undefined
          }
        />
      ),
    }));

    return [categoryHeader, ...shortcutRows];
  });

  return (
    <Box sx={{ mt: 2 }}>
      <NameValueTable rows={rows} />
    </Box>
  );
}

export default function ShortcutsSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const isOpen = useTypedSelector(state => state.shortcuts.isShortcutsDialogOpen);

  const handleClose = () => {
    dispatch(setShortcutsDialogOpen(false));
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      title={t('Keyboard Shortcuts')}
      titleProps={{ focusTitle: true }}
      fullWidth
    >
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 2, py: 1 }}>
          <ShortcutsList />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 2, justifyContent: 'space-between' }}>
        <Button
          size="small"
          startIcon={<Icon icon="mdi:restore" />}
          onClick={() => dispatch(resetAllShortcuts())}
          variant="contained"
          color="secondary"
        >
          {t('Reset All to Defaults')}
        </Button>
        <Button onClick={handleClose} variant="contained" color="primary">
          {t('Close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
