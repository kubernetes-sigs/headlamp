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
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCluster } from '../../lib/k8s';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import ActionButton from '../common/ActionButton';
import { createCustomViewId, CustomViewColSpan } from './storage';
import { useCustomViewsState } from './useCustomViews';

export interface CustomViewWidgetPreset {
  type: string;
  title: string;
  colSpan?: CustomViewColSpan;
  config: Record<string, any>;
}

export interface AddToViewButtonProps {
  /** Resource from a resource details page (e.g. Pod, ReplicaSet, Deployment, Node). */
  item?: KubeObject | null;
  /** Prebuilt widget payload (e.g. Cluster Overview metrics). */
  preset?: CustomViewWidgetPreset;
}

export function AddToViewButton({ item, preset }: AddToViewButtonProps) {
  const { t } = useTranslation(['translation']);
  const activeCluster = useCluster() || '';
  const { enqueueSnackbar } = useSnackbar();
  const { views, widgetDefinitions, createView, addWidgetToView } = useCustomViewsState();
  const [open, setOpen] = useState(false);

  const availableResourceWidgets = useMemo(() => {
    if (!item) {
      return [];
    }
    return widgetDefinitions.filter(
      def => def.supportsResource?.(item) && typeof def.createConfigFromResource === 'function'
    );
  }, [item, widgetDefinitions]);

  const [selectedWidgetType, setSelectedWidgetType] = useState('');
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [selectedViewId, setSelectedViewId] = useState('');
  const [newViewName, setNewViewName] = useState('');
  const [widgetTitle, setWidgetTitle] = useState('');
  const [colSpan, setColSpan] = useState<CustomViewColSpan>(6);

  if (!preset && !item) {
    return null;
  }

  const handleOpen = () => {
    const defaultMode: 'existing' | 'new' = views.length > 0 ? 'existing' : 'new';
    setTargetMode(defaultMode);
    setSelectedViewId(views[0]?.id ?? '');
    setNewViewName(item ? `${item.getName()} View` : 'Cluster View');

    if (preset) {
      setSelectedWidgetType(preset.type);
      setWidgetTitle(preset.title);
      setColSpan(preset.colSpan ?? 6);
    } else if (item && availableResourceWidgets.length > 0) {
      const firstDef = availableResourceWidgets[0];
      const generated = firstDef.createConfigFromResource!({
        resource: item,
        cluster: item.cluster || activeCluster,
      });
      setSelectedWidgetType(firstDef.type);
      setWidgetTitle(generated.title);
      setColSpan(firstDef.defaultColSpan ?? 6);
    }

    setOpen(true);
  };

  const handleWidgetTypeChange = (nextType: string) => {
    setSelectedWidgetType(nextType);
    if (!item) {
      return;
    }

    const def = availableResourceWidgets.find(w => w.type === nextType);
    if (def?.createConfigFromResource) {
      const generated = def.createConfigFromResource({
        resource: item,
        cluster: item.cluster || activeCluster,
      });
      setWidgetTitle(generated.title);
      setColSpan(def.defaultColSpan ?? 6);
    }
  };

  const handleSave = () => {
    let widgetPayload: {
      type: string;
      title: string;
      colSpan: CustomViewColSpan;
      config: Record<string, any>;
    } | null = null;

    if (preset) {
      widgetPayload = {
        type: preset.type,
        title: widgetTitle.trim() || preset.title,
        colSpan,
        config: preset.config,
      };
    } else if (item) {
      const def = availableResourceWidgets.find(w => w.type === selectedWidgetType);
      if (def?.createConfigFromResource) {
        const generated = def.createConfigFromResource({
          resource: item,
          cluster: item.cluster || activeCluster,
        });
        widgetPayload = {
          type: def.type,
          title: widgetTitle.trim() || generated.title,
          colSpan,
          config: generated.config,
        };
      }
    }

    if (!widgetPayload) {
      return;
    }

    if (targetMode === 'new') {
      const trimmedName = newViewName.trim();
      if (!trimmedName) {
        return;
      }
      const newId = createCustomViewId();
      createView({
        id: newId,
        name: trimmedName,
        cluster: item?.cluster || activeCluster || undefined,
        initialWidget: widgetPayload,
      });
      enqueueSnackbar(t('translation|Added to new view "{{name}}"', { name: trimmedName }), {
        variant: 'success',
      });
    } else {
      const targetView = views.find(v => v.id === selectedViewId);
      if (!targetView) {
        return;
      }
      addWidgetToView({
        viewId: targetView.id,
        widget: widgetPayload,
      });
      enqueueSnackbar(t('translation|Added to view "{{name}}"', { name: targetView.name }), {
        variant: 'success',
      });
    }

    setOpen(false);
  };

  const canSubmit = targetMode === 'new' ? newViewName.trim().length > 0 : Boolean(selectedViewId);

  return (
    <>
      <ActionButton
        icon="mdi:view-dashboard-outline"
        onClick={handleOpen}
        description={t('translation|Add to View')}
      />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('translation|Add to View')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {!preset && availableResourceWidgets.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel id="add-to-view-widget-type-label">
                  {t('translation|Widget Type')}
                </InputLabel>
                <Select
                  labelId="add-to-view-widget-type-label"
                  label={t('translation|Widget Type')}
                  value={selectedWidgetType}
                  onChange={e => handleWidgetTypeChange(e.target.value)}
                >
                  {availableResourceWidgets.map(def => (
                    <MenuItem key={def.type} value={def.type}>
                      {def.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              size="small"
              fullWidth
              label={t('translation|Widget Title')}
              value={widgetTitle}
              onChange={e => setWidgetTitle(e.target.value)}
            />

            <FormControl fullWidth size="small">
              <InputLabel id="add-to-view-width-label">{t('translation|Widget Width')}</InputLabel>
              <Select
                labelId="add-to-view-width-label"
                label={t('translation|Widget Width')}
                value={colSpan}
                onChange={e => setColSpan(Number(e.target.value) as CustomViewColSpan)}
              >
                <MenuItem value={4}>{t('translation|Compact (1/3 width)')}</MenuItem>
                <MenuItem value={6}>{t('translation|Half width (1/2)')}</MenuItem>
                <MenuItem value={12}>{t('translation|Full width')}</MenuItem>
              </Select>
            </FormControl>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('translation|Destination View')}
              </Typography>
              <RadioGroup
                value={targetMode}
                onChange={e => setTargetMode(e.target.value as 'existing' | 'new')}
              >
                <FormControlLabel
                  value="existing"
                  control={<Radio size="small" />}
                  label={t('translation|Existing view')}
                  disabled={views.length === 0}
                />
                <FormControlLabel
                  value="new"
                  control={<Radio size="small" />}
                  label={t('translation|Create new view')}
                />
              </RadioGroup>
            </Box>

            {targetMode === 'existing' ? (
              <FormControl fullWidth size="small">
                <InputLabel id="add-to-view-select-label">{t('translation|View')}</InputLabel>
                <Select
                  labelId="add-to-view-select-label"
                  label={t('translation|View')}
                  value={selectedViewId}
                  onChange={e => setSelectedViewId(e.target.value)}
                >
                  {views.map(view => (
                    <MenuItem key={view.id} value={view.id}>
                      {view.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                size="small"
                fullWidth
                required
                label={t('translation|New View Name')}
                value={newViewName}
                onChange={e => setNewViewName(e.target.value)}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('translation|Cancel')}</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSubmit}>
            {t('translation|Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
