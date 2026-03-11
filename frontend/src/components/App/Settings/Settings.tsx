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
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { isElectron } from '../../../helpers/isElectron';
import { useSetting } from '../../../helpers/useAdminSettings';
import LocaleSelect from '../../../i18n/LocaleSelect/LocaleSelect';
import { setAppSettings } from '../../../redux/configSlice';
import { defaultTableRowsPerPageOptions } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { uiSlice } from '../../../redux/uiSlice';
import ActionButton from '../../common/ActionButton';
import NameValueTable from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';
import TimezoneSelect from '../../common/TimezoneSelect';
import { theme } from '../../TestHelpers/theme';
import { setTheme, useAppThemes } from '../themeSlice';
import DrawerModeSettings from './DrawerModeSettings';
import NumRowsInput from './NumRowsInput';
import { ShortcutsList } from './ShortcutsSettings';
import { ThemePreview } from './ThemePreview';

/** Wraps a setting value with a "Set by your administrator" tooltip when disabled. */
function AdminControlled({
  disabled,
  children,
  t,
}: {
  disabled: boolean;
  children: React.ReactNode;
  t: (key: string) => string;
}) {
  if (!disabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip title={t('translation|Set by your administrator')} placement="top">
      <Box component="div" sx={{ opacity: 0.6 }}>
        {children}
      </Box>
    </Tooltip>
  );
}

export default function Settings() {
  const { t } = useTranslation(['translation']);
  const timezone = useSetting<string>('timezone');
  const tableRows = useSetting<number[]>('tableRowsPerPageOptions');
  const sidebarSort = useSetting<boolean>('sidebarSortAlphabetically');
  const evict = useSetting<boolean>('useEvict');
  const themeDisplay = useSetting('theme');

  const [selectedTimezone, setSelectedTimezone] = useState<string>(
    timezone.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [sortSidebar, setSortSidebar] = useState<boolean>(sidebarSort.value ?? false);
  const [useEvict, setUseEvict] = useState<boolean>(evict.value ?? true);
  const [trayIcon, setTrayIcon] = useState<boolean>(true);
  const dispatch = useDispatch();
  const themeName = useTypedSelector(state => state.theme.name);
  const appThemes = useAppThemes();
  const forceTheme = useTypedSelector(state => state.config.forceTheme);

  // Sync local state when admin-resolved values change (e.g. after async fetch).
  useEffect(() => {
    setSelectedTimezone(timezone.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [timezone.value]);

  useEffect(() => {
    setSortSidebar(sidebarSort.value ?? false);
  }, [sidebarSort.value]);

  useEffect(() => {
    setUseEvict(evict.value ?? true);
  }, [evict.value]);

  useEffect(() => {
    if (!timezone.disabled) {
      dispatch(setAppSettings({ timezone: selectedTimezone }));
    }
    // Only react to user-driven changes; admin-disabled state is checked
    // inside the effect but is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTimezone]);

  useEffect(() => {
    if (!sidebarSort.disabled) {
      dispatch(setAppSettings({ sidebarSortAlphabetically: sortSidebar }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortSidebar]);

  useEffect(() => {
    if (!evict.disabled) {
      dispatch(setAppSettings({ useEvict: useEvict }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useEvict]);

  useEffect(() => {
    if (!isElectron()) {
      return;
    }

    const handler = (enabled: boolean) => setTrayIcon(enabled);
    const unsubscribe = window.desktopApi?.receive('tray-icon', handler);
    window.desktopApi?.send('request-tray-icon');

    return () => {
      unsubscribe?.();
    };
  }, []);

  function handleTrayIconChange(enabled: boolean) {
    setTrayIcon(enabled);
    window.desktopApi?.send('set-tray-icon', enabled);
  }

  const sidebarLabelID = 'sort-sidebar-label';
  const evictLabelID = 'use-evict-label';
  const trayIconLabelID = 'tray-icon-label';
  const tableRowsLabelID = 'rows-per-page-label';
  const timezoneLabelID = 'timezone-label';

  return (
    <SectionBox
      title={t('translation|General Settings')}
      headerProps={{
        actions: [
          <ActionButton
            key="version"
            icon="mdi:information-outline"
            description={t('translation|Version')}
            onClick={() => {
              dispatch(uiSlice.actions.setVersionDialogOpen(true));
            }}
          />,
        ],
      }}
      backLink
    >
      <NameValueTable
        rows={[
          {
            name: t('translation|Language'),
            value: <LocaleSelect showFullNames formControlProps={{ className: '' }} />,
          },
          {
            name: t('translation|Resource details view'),
            value: <DrawerModeSettings />,
          },
          {
            name: t('translation|Number of rows for tables'),
            value: (
              <AdminControlled disabled={tableRows.disabled} t={t}>
                <NumRowsInput
                  defaultValue={tableRows.value || defaultTableRowsPerPageOptions}
                  nameLabelID={tableRowsLabelID}
                  disabled={tableRows.disabled}
                />
              </AdminControlled>
            ),
            nameID: tableRowsLabelID,
            hide: tableRows.hidden,
          },
          {
            name: t('translation|Timezone to display for dates'),
            value: (
              <AdminControlled disabled={timezone.disabled} t={t}>
                <Box maxWidth="350px">
                  <TimezoneSelect
                    initialTimezone={selectedTimezone}
                    onChange={name => setSelectedTimezone(name)}
                    nameLabelID={timezoneLabelID}
                    disabled={timezone.disabled}
                  />
                </Box>
              </AdminControlled>
            ),
            nameID: timezoneLabelID,
            hide: timezone.hidden,
          },
          {
            name: t('translation|Sort sidebar items alphabetically'),
            value: (
              <AdminControlled disabled={sidebarSort.disabled} t={t}>
                <Switch
                  color="primary"
                  checked={sortSidebar}
                  onChange={e => setSortSidebar(e.target.checked)}
                  disabled={sidebarSort.disabled}
                  inputProps={{
                    'aria-labelledby': sidebarLabelID,
                  }}
                />
              </AdminControlled>
            ),
            nameID: sidebarLabelID,
            hide: sidebarSort.hidden,
          },
          {
            name: t('translation|Use evict for pod deletion'),
            value: (
              <AdminControlled disabled={evict.disabled} t={t}>
                <Switch
                  color="primary"
                  checked={useEvict}
                  onChange={e => setUseEvict(e.target.checked)}
                  disabled={evict.disabled}
                  inputProps={{
                    'aria-labelledby': evictLabelID,
                  }}
                />
              </AdminControlled>
            ),
            nameID: evictLabelID,
            hide: evict.hidden,
          },
          ...(isElectron()
            ? [
                {
                  name: t('translation|Show system tray icon'),
                  value: (
                    <Switch
                      color="primary"
                      checked={trayIcon}
                      onChange={e => handleTrayIconChange(e.target.checked)}
                      inputProps={{
                        'aria-labelledby': trayIconLabelID,
                      }}
                    />
                  ),
                  nameID: trayIconLabelID,
                },
              ]
            : []),
        ]}
      />
      {!themeDisplay.hidden && (
        <AdminControlled disabled={themeDisplay.disabled || !!forceTheme} t={t}>
          <Box
            sx={{
              mt: '2',
              borderTop: '1px solid',
              borderTopColor: 'divider',
              pt: '2',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                px: 1.5,
                py: 1,
              }}
            >
              <Typography
                variant="body1"
                sx={theme => ({
                  textAlign: 'left',
                  color: theme.palette.text.secondary,
                  fontSize: '1rem',
                  [theme.breakpoints.down('sm')]: {
                    fontSize: '1.5rem',
                    color: theme.palette.text.primary,
                  },
                })}
              >
                {t('translation|Theme')}
              </Typography>
            </Box>
            <Box
              sx={{
                width: '100%',
                margin: 'auto',
                pb: 5,
              }}
            >
              {forceTheme && (
                <Typography
                  variant="body2"
                  sx={theme => ({
                    textAlign: 'center',
                    color: theme.palette.text.secondary,
                    fontStyle: 'italic',
                    mb: 2,
                  })}
                >
                  {t('translation|Theme has been forced by your administrator')}
                </Typography>
              )}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 2,
                  justifyContent: 'center',
                  [theme.breakpoints.down('sm')]: {
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 2,
                  },
                }}
              >
                {appThemes.map(it => (
                  <Box
                    key={it.name}
                    role="button"
                    tabIndex={themeDisplay.disabled || forceTheme ? -1 : 0}
                    aria-disabled={themeDisplay.disabled || !!forceTheme || undefined}
                    onKeyDown={
                      themeDisplay.disabled || forceTheme
                        ? undefined
                        : e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              dispatch(setTheme(it.name));
                            }
                          }
                    }
                    sx={{
                      cursor: themeDisplay.disabled || forceTheme ? 'default' : 'pointer',
                      border: themeName === it.name ? '2px solid' : '1px solid',
                      borderColor: themeName === it.name ? 'primary' : 'divider',
                      borderRadius: 2,
                      p: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      transition: '0.2 ease',
                      '&:hover': {
                        backgroundColor:
                          themeDisplay.disabled || forceTheme ? undefined : 'divider',
                      },
                    }}
                    onClick={
                      themeDisplay.disabled || forceTheme
                        ? undefined
                        : () => dispatch(setTheme(it.name))
                    }
                  >
                    <ThemePreview theme={it} size={110} />
                    <Box sx={{ mt: 1 }}>{it.name}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </AdminControlled>
      )}
      <Box sx={{ mt: 4 }}>
        <SectionBox
          title={t('translation|Keyboard Shortcuts')}
          headerProps={{
            headerStyle: 'subsection',
          }}
        >
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {t(
              'translation|Configure keyboard shortcuts for quick access to various parts of the application.'
            )}
          </Typography>
          <ShortcutsList />
        </SectionBox>
      </Box>
    </SectionBox>
  );
}
