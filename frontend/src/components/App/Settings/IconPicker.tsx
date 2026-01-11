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
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';

// Preset icons for cluster appearance
export const PRESET_ICONS = [
  { name: 'Kubernetes', value: 'mdi:kubernetes' },
  { name: 'Alert Circle', value: 'mdi:alert-circle' },
  { name: 'Shield Alert', value: 'mdi:shield-alert' },
  { name: 'Server', value: 'mdi:server' },
  { name: 'Code Tags', value: 'mdi:code-tags' },
  { name: 'Test Tube', value: 'mdi:test-tube' },
  { name: 'Rocket', value: 'mdi:rocket-launch-outline' },
  { name: 'Cloud', value: 'mdi:cloud-outline' },
  { name: 'Database', value: 'mdi:database' },
  { name: 'Hexagon Multiple', value: 'mdi:hexagon-multiple-outline' },
  { name: 'Lock', value: 'mdi:lock' },
  { name: 'Key', value: 'mdi:shield-key' },
  { name: 'Lightning', value: 'mdi:lightning-bolt-circle' },
  { name: 'Star', value: 'mdi:star' },
  { name: 'Presentation', value: 'mdi:presentation' },
];

interface IconPickerProps {
  open: boolean;
  currentIcon: string;
  onClose: () => void;
  onSelectIcon: (icon: string) => void;
}

export default function IconPicker({ open, currentIcon, onClose, onSelectIcon }: IconPickerProps) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();

  const [customIconInput, setCustomIconInput] = React.useState('');
  const [useCustomIcon, setUseCustomIcon] = React.useState(false);

  const handlePresetIconClick = (icon: string) => {
    setUseCustomIcon(false);
    onSelectIcon(icon);
    onClose();
  };

  const handleApplyCustomIcon = () => {
    onSelectIcon(customIconInput);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle>{t('translation|Choose Cluster Icon')}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {PRESET_ICONS.map(iconOption => (
              <Tooltip key={iconOption.value} title={iconOption.name}>
                <ToggleButton
                  value={iconOption.value}
                  selected={currentIcon === iconOption.value && !useCustomIcon}
                  onChange={() => handlePresetIconClick(iconOption.value)}
                  disabled={useCustomIcon}
                  sx={{
                    width: 56,
                    height: 56,
                    '&.Mui-selected': {
                      border: `3px solid ${theme.palette.primary.main}`,
                    },
                    '&.Mui-disabled': {
                      opacity: 0.5,
                    },
                  }}
                >
                  <Icon icon={iconOption.value} width={32} />
                </ToggleButton>
              </Tooltip>
            ))}
          </Box>
        </Box>
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={useCustomIcon}
                onChange={e => setUseCustomIcon(e.target.checked)}
              />
            }
            label={t('translation|Use custom icon')}
          />
          {useCustomIcon && (
            <TextField
              label={t('translation|Custom icon (Iconify)')}
              placeholder="mdi:shield-alert"
              value={customIconInput}
              onChange={e => setCustomIconInput(e.target.value)}
              fullWidth
              helperText={t('translation|Example: mdi:kubernetes, mdi:cloud-outline')}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('translation|Cancel')}</Button>
        {useCustomIcon && (
          <Button onClick={handleApplyCustomIcon} disabled={!customIconInput}>
            {t('translation|Apply')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
