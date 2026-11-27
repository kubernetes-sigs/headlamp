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
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomViewWidgetDefinition } from '../../redux/customViewsSlice';
import type { CustomViewColSpan, CustomViewWidgetInstance } from './storage';

export interface WidgetDialogProps {
  open: boolean;
  onClose: () => void;
  cluster: string;
  widgetDefinitions: CustomViewWidgetDefinition<any>[];
  initialWidget?: CustomViewWidgetInstance | null;
  onSave: (widget: {
    type: string;
    title: string;
    colSpan: CustomViewColSpan;
    config: Record<string, any>;
  }) => void;
}

function WidgetDialogForm({
  onClose,
  cluster,
  widgetDefinitions,
  initialWidget,
  onSave,
}: Omit<WidgetDialogProps, 'open'>) {
  const { t } = useTranslation(['translation']);
  const isEditing = Boolean(initialWidget);
  const defaultDef = widgetDefinitions[0];

  const [selectedType, setSelectedType] = useState(
    () => initialWidget?.type ?? defaultDef?.type ?? ''
  );
  const [title, setTitle] = useState(() => initialWidget?.title ?? defaultDef?.label ?? '');
  const [colSpan, setColSpan] = useState<CustomViewColSpan>(
    () => initialWidget?.colSpan ?? defaultDef?.defaultColSpan ?? 6
  );
  const [config, setConfig] = useState<Record<string, any>>(
    () => initialWidget?.config ?? (cluster ? { cluster } : {})
  );

  const activeDef = widgetDefinitions.find(def => def.type === selectedType);
  const ConfigComponent = activeDef?.configComponent;

  const handleTypeChange = (nextType: string) => {
    const nextDef = widgetDefinitions.find(def => def.type === nextType);
    setSelectedType(nextType);
    if (nextDef) {
      setTitle(nextDef.label);
      setColSpan(nextDef.defaultColSpan ?? 6);
    }
    setConfig(cluster ? { cluster } : {});
  };

  const handleSubmit = () => {
    if (!selectedType) {
      return;
    }

    onSave({
      type: selectedType,
      title: title.trim() || activeDef?.label || selectedType,
      colSpan,
      config,
    });
    onClose();
  };

  return (
    <>
      <DialogTitle>
        {isEditing ? t('translation|Edit Widget') : t('translation|Add Widget')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <FormControl fullWidth size="small" disabled={isEditing}>
            <InputLabel id="custom-view-widget-select-label">
              {t('translation|Widget Type')}
            </InputLabel>
            <Select
              labelId="custom-view-widget-select-label"
              label={t('translation|Widget Type')}
              value={selectedType}
              onChange={e => handleTypeChange(e.target.value)}
            >
              {widgetDefinitions.map(def => (
                <MenuItem key={def.type} value={def.type}>
                  {def.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {activeDef?.description && (
            <Typography variant="body2" color="text.secondary">
              {activeDef.description}
            </Typography>
          )}

          <TextField
            size="small"
            fullWidth
            label={t('translation|Widget Title')}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <FormControl fullWidth size="small">
            <InputLabel id="custom-view-widget-width-label">
              {t('translation|Widget Width')}
            </InputLabel>
            <Select
              labelId="custom-view-widget-width-label"
              label={t('translation|Widget Width')}
              value={colSpan}
              onChange={e => setColSpan(Number(e.target.value) as CustomViewColSpan)}
            >
              <MenuItem value={4}>{t('translation|Compact (1/3 width)')}</MenuItem>
              <MenuItem value={6}>{t('translation|Half width (1/2)')}</MenuItem>
              <MenuItem value={12}>{t('translation|Full width')}</MenuItem>
            </Select>
          </FormControl>

          {ConfigComponent && (
            <ConfigComponent config={config} onChange={setConfig} cluster={cluster} />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('translation|Cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!selectedType}>
          {isEditing ? t('translation|Save') : t('translation|Add')}
        </Button>
      </DialogActions>
    </>
  );
}

export function WidgetDialog({ open, onClose, ...rest }: WidgetDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {open ? (
        <WidgetDialogForm
          key={rest.initialWidget?.id ?? `new-${rest.widgetDefinitions[0]?.type ?? ''}`}
          onClose={onClose}
          {...rest}
        />
      ) : null}
    </Dialog>
  );
}
