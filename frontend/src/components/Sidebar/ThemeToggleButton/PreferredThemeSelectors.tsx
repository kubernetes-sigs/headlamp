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
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTypedSelector } from '../../../redux/hooks';
import { useAppThemes } from '../../App/themeSlice';
import {
  getPreferredDarkThemeName,
  getPreferredLightThemeName,
  getQuickSwapEnabled,
  getRememberThemeChoices,
  isDarkTheme,
  isLightTheme,
  QUICK_SWAP_EVENT,
  setPreferredDarkThemeName,
  setPreferredLightThemeName,
  setQuickSwapEnabled,
  setRememberThemeChoices,
} from './ThemeToggleButton';

/**
 * "Quick swap theme" settings block: master enable, remember-vs-custom mode toggles,
 * and preferred light/dark dropdowns used when custom mode is on.
 */
export function PreferredThemeSelectors() {
  const { t } = useTranslation(['translation']);
  const appThemes = useAppThemes();
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const lightThemes = appThemes.filter(isLightTheme);
  const darkThemes = appThemes.filter(isDarkTheme);

  const [storedPreferredLight, setStoredPreferredLight] = useState<string>(() =>
    getPreferredLightThemeName()
  );
  const [storedPreferredDark, setStoredPreferredDark] = useState<string>(() =>
    getPreferredDarkThemeName()
  );
  const [rememberEnabled, setRememberEnabled] = useState<boolean>(() => getRememberThemeChoices());
  const [quickSwapOn, setQuickSwapOn] = useState<boolean>(() => getQuickSwapEnabled());

  useEffect(() => {
    const syncFromStorage = () => {
      setStoredPreferredLight(getPreferredLightThemeName());
      setStoredPreferredDark(getPreferredDarkThemeName());
      setRememberEnabled(getRememberThemeChoices());
      setQuickSwapOn(getQuickSwapEnabled());
    };
    window.addEventListener(QUICK_SWAP_EVENT, syncFromStorage);
    return () => window.removeEventListener(QUICK_SWAP_EVENT, syncFromStorage);
  }, []);

  // Fall back to a valid option if the stored preference no longer exists.
  const preferredLight =
    lightThemes.find(t => t.name === storedPreferredLight)?.name ??
    lightThemes[0]?.name ??
    storedPreferredLight;
  const preferredDark =
    darkThemes.find(t => t.name === storedPreferredDark)?.name ??
    darkThemes[0]?.name ??
    storedPreferredDark;

  // Persist the corrected fallback so storage matches what's shown.
  useEffect(() => {
    if (preferredLight !== storedPreferredLight) {
      setPreferredLightThemeName(preferredLight);
    }
  }, [preferredLight, storedPreferredLight]);

  useEffect(() => {
    if (preferredDark !== storedPreferredDark) {
      setPreferredDarkThemeName(preferredDark);
    }
  }, [preferredDark, storedPreferredDark]);

  const handleLightChange = (event: SelectChangeEvent<string>) => {
    const name = event.target.value;
    setStoredPreferredLight(name);
    setPreferredLightThemeName(name);
  };

  const handleDarkChange = (event: SelectChangeEvent<string>) => {
    const name = event.target.value;
    setStoredPreferredDark(name);
    setPreferredDarkThemeName(name);
  };

  // The two modes are mutually exclusive; enabling one turns the other off.
  const setMode = (remember: boolean) => {
    setRememberEnabled(remember);
    setRememberThemeChoices(remember);
  };

  const disabled = !!forceTheme;
  const featureOff = disabled || !quickSwapOn;
  const customEnabled = !rememberEnabled;
  const lightLabelId = 'preferred-light-mode-label';
  const darkLabelId = 'preferred-dark-mode-label';
  const quickSwapLabelId = 'quick-swap-theme-label';

  const handleQuickSwapToggle = (value: boolean) => {
    setQuickSwapOn(value);
    setQuickSwapEnabled(value);
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography
          variant="subtitle2"
          component="div"
          sx={{ color: 'text.secondary', fontWeight: 600 }}
        >
          {t('translation|Quick swap theme')}
        </Typography>
        <FormControlLabel
          sx={{ ml: 0 }}
          control={
            <Switch
              color="primary"
              checked={quickSwapOn}
              disabled={disabled}
              onChange={e => handleQuickSwapToggle(e.target.checked)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !disabled) {
                  e.preventDefault();
                  handleQuickSwapToggle(!quickSwapOn);
                }
              }}
              inputProps={{ 'aria-labelledby': quickSwapLabelId }}
            />
          }
          label={
            <span id={quickSwapLabelId}>
              {quickSwapOn ? t('translation|Enabled') : t('translation|Disabled')}
            </span>
          }
        />
      </Box>

      <FormControl component="fieldset" disabled={featureOff} sx={{ mt: 1 }}>
        <RadioGroup
          aria-label={t('translation|Quick swap mode')}
          value={rememberEnabled ? 'remember' : 'custom'}
          onChange={e => setMode(e.target.value === 'remember')}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FormControlLabel
              value="remember"
              control={<Radio color="primary" />}
              label={t('translation|Remember theme choices')}
            />
            <Tooltip
              title={t(
                'translation|Remember your choices for light and dark themes you used recently and allow swapping between those'
              )}
            >
              <Box
                component="span"
                role="img"
                tabIndex={0}
                sx={{ display: 'inline-flex', color: 'text.secondary' }}
                aria-label={t(
                  'translation|Remember your choices for light and dark themes you used recently and allow swapping between those'
                )}
              >
                <Icon icon="mdi:information-outline" width={18} />
              </Box>
            </Tooltip>
          </Box>
          <FormControlLabel
            value="custom"
            control={<Radio color="primary" />}
            label={t('translation|Custom quick theme choices')}
          />
        </RadioGroup>
      </FormControl>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mt: 1,
          ml: 4,
          opacity: featureOff || !customEnabled ? 0.6 : 1,
        }}
      >
        <FormControl
          sx={{ minWidth: 220 }}
          size="small"
          disabled={featureOff || !customEnabled || lightThemes.length === 0}
        >
          <InputLabel id={lightLabelId}>{t('translation|Preferred Light mode')}</InputLabel>
          <Select
            labelId={lightLabelId}
            value={preferredLight}
            label={t('translation|Preferred Light mode')}
            onChange={handleLightChange}
          >
            {lightThemes.map(it => (
              <MenuItem key={it.name} value={it.name}>
                {it.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          sx={{ minWidth: 220 }}
          size="small"
          disabled={featureOff || !customEnabled || darkThemes.length === 0}
        >
          <InputLabel id={darkLabelId}>{t('translation|Preferred Dark mode')}</InputLabel>
          <Select
            labelId={darkLabelId}
            value={preferredDark}
            label={t('translation|Preferred Dark mode')}
            onChange={handleDarkChange}
          >
            {darkThemes.map(it => (
              <MenuItem key={it.name} value={it.name}>
                {it.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
}
