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
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../../redux/hooks';
import { reapplyThemePreferences, useAppThemes } from '../../App/themeSlice';
import {
  getFollowSystemAppearance,
  getQuickSwapEnabled,
  getRememberThemeChoices,
  isDarkTheme,
  isLightTheme,
  resolvePreferredDarkThemeName,
  resolvePreferredLightThemeName,
  setFollowSystemAppearance,
  setPreferredDarkThemeName,
  setPreferredLightThemeName,
  setQuickSwapEnabled,
  setRememberThemeChoices,
  useQuickSwapSettingsRevision,
} from './ThemeToggleButton';

/**
 * "Quick swap theme" settings block: master enable, remember-vs-custom mode toggles,
 * and preferred light/dark dropdowns used when custom mode is on.
 */
export function PreferredThemeSelectors() {
  const { t } = useTranslation(['translation']);
  const appThemes = useAppThemes();
  const forceTheme = useTypedSelector(state => state.config.forceTheme);
  const configuredLight = useTypedSelector(state => state.config.defaultLightTheme);
  const configuredDark = useTypedSelector(state => state.config.defaultDarkTheme);
  const dispatch = useDispatch();
  const lightThemes = appThemes.filter(isLightTheme);
  const darkThemes = appThemes.filter(isDarkTheme);

  // Re-renders on any quick swap setting change (in this tab or another), so these reads and
  // the selections below stay current, including themes registered after mount.
  useQuickSwapSettingsRevision();
  const rememberEnabled = getRememberThemeChoices();
  const quickSwapOn = getQuickSwapEnabled();
  const followSystem = getFollowSystemAppearance();

  // Display-only fallback: storage is only written on explicit user choices, so a stored
  // preference for a not-yet-registered (or temporarily unavailable) plugin theme survives.
  const preferredLight = resolvePreferredLightThemeName(appThemes, configuredLight);
  const preferredDark = resolvePreferredDarkThemeName(appThemes, configuredDark);

  // A saved quick swap theme is also the launch theme when no other theme was picked, so
  // re-evaluate now instead of waiting for the next periodic backend config refresh.
  const applyLaunchTheme = () => {
    if (followSystem) {
      return;
    }
    dispatch(
      reapplyThemePreferences({
        defaultLightTheme: configuredLight,
        defaultDarkTheme: configuredDark,
      })
    );
  };

  const handleLightChange = (event: SelectChangeEvent<string>) => {
    setPreferredLightThemeName(event.target.value);
    applyLaunchTheme();
  };

  const handleDarkChange = (event: SelectChangeEvent<string>) => {
    setPreferredDarkThemeName(event.target.value);
    applyLaunchTheme();
  };

  // The two modes are mutually exclusive; enabling one turns the other off.
  const setMode = (remember: boolean) => {
    setRememberThemeChoices(remember);
  };

  const disabled = !!forceTheme;
  const featureOff = disabled || !quickSwapOn;
  const customEnabled = !rememberEnabled;
  // The light/dark pair is used by custom quick swap and by following the system appearance.
  const pairEditable = !disabled && ((quickSwapOn && customEnabled) || followSystem);
  const lightLabelId = 'preferred-light-mode-label';
  const darkLabelId = 'preferred-dark-mode-label';

  const handleQuickSwapToggle = (value: boolean) => {
    setQuickSwapEnabled(value);
  };

  const handleFollowSystemToggle = (value: boolean) => {
    setFollowSystemAppearance(value);
  };

  const followSystemDescription = t(
    'translation|Switch between your light and dark themes automatically when your system appearance changes. While on, picking a theme sets it as your light or dark theme.'
  );

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
              size="small"
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
              inputProps={{ 'aria-label': t('translation|Quick swap theme') }}
            />
          }
          label={<span>{quickSwapOn ? t('translation|Enabled') : t('translation|Disabled')}</span>}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <FormControlLabel
          // A small switch with this offset lines its control and label up with the radios below.
          sx={{ ml: '-9px' }}
          control={
            <Switch
              size="small"
              color="primary"
              checked={followSystem}
              disabled={disabled}
              onChange={e => handleFollowSystemToggle(e.target.checked)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !disabled) {
                  e.preventDefault();
                  handleFollowSystemToggle(!followSystem);
                }
              }}
            />
          }
          label={t('translation|Follow system appearance')}
        />
        <Tooltip title={followSystemDescription}>
          <Box
            component="span"
            role="img"
            tabIndex={0}
            sx={{ display: 'inline-flex', color: 'text.secondary' }}
            aria-label={followSystemDescription}
          >
            <Icon icon="mdi:information-outline" width={18} />
          </Box>
        </Tooltip>
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
          opacity: pairEditable ? 1 : 0.6,
        }}
      >
        <FormControl
          sx={{ minWidth: 220 }}
          size="small"
          disabled={!pairEditable || lightThemes.length === 0}
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
          disabled={!pairEditable || darkThemes.length === 0}
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
