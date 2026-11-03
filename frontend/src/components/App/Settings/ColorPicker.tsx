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
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { RgbaColorPicker } from 'react-colorful';
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

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_RGBA: RgbaColor = { r: 255, g: 0, b: 0, a: 1 };

const isPresetColor = (color: string): boolean =>
  PRESET_COLORS.some(preset => preset.value.toLowerCase() === color.toLowerCase());

// Parses hex, rgb() and rgba() (comma syntax) strings. Returns null for anything else.
const parseRgbaFromString = (color: string): RgbaColor | null => {
  if (!color) {
    return null;
  }

  // Try to parse rgba()
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i
  );
  if (rgbaMatch) {
    return {
      r: Math.min(255, parseInt(rgbaMatch[1], 10)),
      g: Math.min(255, parseInt(rgbaMatch[2], 10)),
      b: Math.min(255, parseInt(rgbaMatch[3], 10)),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // Try hex
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(c => c + c)
        .join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return { r, g, b, a };
      }
    }
  }

  return null;
};

const rgbaToString = (color: RgbaColor): string => {
  if (color.a === 1) {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
  }
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a})`;
};

interface ColorPickerProps {
  open: boolean;
  currentColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

export default function ColorPicker({
  open,
  currentColor,
  onClose,
  onSelectColor,
}: ColorPickerProps) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();

  const [customColorInput, setCustomColorInput] = React.useState('');
  const [useCustomColor, setUseCustomColor] = React.useState(false);
  const [rgbaColor, setRgbaColor] = React.useState<RgbaColor>(DEFAULT_RGBA);
  const [pickerAnchor, setPickerAnchor] = React.useState<HTMLElement | null>(null);

  const isValidAccentColor = (color: string): boolean => !color || isValidCssColor(color);
  const swatchColor = rgbaToString(rgbaColor);

  // Sync local state with the saved color every time the dialog opens.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    setPickerAnchor(null);
    const isCustom = !!currentColor?.trim() && !isPresetColor(currentColor);
    setUseCustomColor(isCustom);
    setCustomColorInput(isCustom ? currentColor : '');
    setRgbaColor(parseRgbaFromString(currentColor) ?? DEFAULT_RGBA);
  }, [open, currentColor]);

  const handleInputChange = (value: string) => {
    setCustomColorInput(value);
    if (value && isValidAccentColor(value)) {
      const parsed = parseRgbaFromString(value);
      if (parsed) {
        setRgbaColor(parsed);
      }
    }
  };

  const handlePresetColorClick = (color: string) => {
    setUseCustomColor(false);
    onSelectColor(color);
    onClose();
  };

  const handleApplyCustomColor = () => {
    if (isValidAccentColor(customColorInput)) {
      onSelectColor(customColorInput);
      onClose();
    }
  };

  const handlePickerChange = (color: RgbaColor) => {
    setRgbaColor(color);
    setCustomColorInput(rgbaToString(color));
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
                onChange={e => {
                  setUseCustomColor(e.target.checked);
                  if (!e.target.checked) {
                    setPickerAnchor(null);
                  }
                }}
              />
            }
            label={t('translation|Use custom color')}
          />
          {useCustomColor && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Tooltip title={t('translation|Select custom color')}>
                <IconButton
                  aria-label={t('translation|Select custom color')}
                  onClick={e => setPickerAnchor(e.currentTarget)}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: swatchColor,
                    '&:hover': {
                      backgroundColor: swatchColor,
                      opacity: 0.8,
                    },
                  }}
                />
              </Tooltip>
              <TextField
                label={t('translation|Custom color')}
                placeholder="#ff0000"
                value={customColorInput}
                onChange={e => handleInputChange(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
                helperText={t('translation|Hex, rgb(), or rgba()')}
                error={!!customColorInput && !isValidAccentColor(customColorInput)}
              />
              <Popover
                open={!!pickerAnchor}
                anchorEl={pickerAnchor}
                onClose={() => setPickerAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              >
                <Box sx={{ p: 1.5 }}>
                  <RgbaColorPicker
                    color={rgbaColor}
                    onChange={handlePickerChange}
                    style={{ width: 200, height: 160 }}
                  />
                </Box>
              </Popover>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="secondary" onClick={onClose}>
          {t('translation|Cancel')}
        </Button>
        {useCustomColor && (
          <Button
            variant="contained"
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
