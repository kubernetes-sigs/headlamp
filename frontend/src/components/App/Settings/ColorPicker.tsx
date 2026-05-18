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
import { isValidCssColor } from '../../../helpers/clusterAppearance';

// Preset colors for cluster appearance
export const PRESET_COLORS = [
  { name: 'Red', value: '#f44336' },
  { name: 'Pink', value: '#e91e63' },
  { name: 'Purple', value: '#9c27b0' },
  { name: 'Deep Purple', value: '#673ab7' },
  { name: 'Indigo', value: '#3f51b5' },
  { name: 'Blue', value: '#2196f3' },
  { name: 'Light Blue', value: '#03a9f4' },
  { name: 'Cyan', value: '#00bcd4' },
  { name: 'Teal', value: '#009688' },
  { name: 'Green', value: '#4caf50' },
  { name: 'Light Green', value: '#8bc34a' },
  { name: 'Lime', value: '#cddc39' },
  { name: 'Yellow', value: '#ffeb3b' },
  { name: 'Amber', value: '#ffc107' },
  { name: 'Orange', value: '#ff9800' },
  { name: 'Deep Orange', value: '#ff5722' },
];

interface ColorPickerProps {
  open: boolean;
  currentColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
  onError: (error: string) => void;
}

export default function ColorPicker({
  open,
  currentColor,
  onClose,
  onSelectColor,
  onError,
}: ColorPickerProps) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();

  const [customColorInput, setCustomColorInput] = React.useState('');
  const [useCustomColor, setUseCustomColor] = React.useState(false);

  const isValidAccentColor = (color: string): boolean => !color || isValidCssColor(color);

  const handlePresetColorClick = (color: string) => {
    setUseCustomColor(false);
    onSelectColor(color);
    onError('');
    onClose();
  };

  const handleApplyCustomColor = () => {
    if (isValidAccentColor(customColorInput)) {
      onSelectColor(customColorInput);
      onError('');
      onClose();
    } else {
      onError(
        t('translation|Accent color format is invalid. Use hex (#ff0000), rgb(), or rgba().')
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm">
      <DialogTitle>{t('translation|Choose Accent Color')}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {PRESET_COLORS.map(color => (
              <Tooltip key={color.value} title={color.name}>
                <ToggleButton
                  value={color.value}
                  selected={currentColor === color.value && !useCustomColor}
                  onChange={() => handlePresetColorClick(color.value)}
                  disabled={useCustomColor}
                  sx={{
                    width: 48,
                    height: 48,
                    backgroundColor: color.value,
                    '&:hover': {
                      backgroundColor: color.value,
                      opacity: 0.8,
                    },
                    '&.Mui-selected': {
                      backgroundColor: color.value,
                      border: `3px solid ${theme.palette.text.primary}`,
                      '&:hover': {
                        backgroundColor: color.value,
                      },
                    },
                    '&.Mui-disabled': {
                      opacity: 0.5,
                    },
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        </Box>
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={useCustomColor}
                onChange={e => setUseCustomColor(e.target.checked)}
              />
            }
            label={t('translation|Use custom color')}
          />
          {useCustomColor && (
            <TextField
              label={t('translation|Custom color')}
              placeholder="#ff0000"
              value={customColorInput}
              onChange={e => setCustomColorInput(e.target.value)}
              fullWidth
              helperText={t('translation|Hex, rgb(), or rgba()')}
              error={!!customColorInput && !isValidAccentColor(customColorInput)}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('translation|Cancel')}</Button>
        {useCustomColor && (
          <Button
            onClick={handleApplyCustomColor}
            disabled={!customColorInput || !isValidAccentColor(customColorInput)}
          >
            {t('translation|Apply')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
