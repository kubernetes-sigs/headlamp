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
import Typography from '@mui/material/Typography';
import { capitalize } from 'lodash';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
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
import { useSettings } from './hook';
import NumRowsInput from './NumRowsInput';
import { ShortcutsList } from './ShortcutsSettings';
import { ThemePreview } from './ThemePreview';

export default function Settings() {
  const { t } = useTranslation(['translation']);
  const settingsObj = useSettings();
  const storedTimezone = settingsObj.timezone;
  const storedRowsPerPageOptions = settingsObj.tableRowsPerPageOptions;
  const storedSortSidebar = settingsObj.sidebarSortAlphabetically;
  const storedUseEvict = settingsObj.useEvict;
  const [selectedTimezone, setSelectedTimezone] = useState<string>(
    storedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [sortSidebar, setSortSidebar] = useState<boolean>(storedSortSidebar);
  const [useEvict, setUseEvict] = useState<boolean>(storedUseEvict);
  const dispatch = useDispatch();
  const themeName = useTypedSelector(state => state.theme.name);
  const appThemes = useAppThemes();

  useEffect(() => {
    dispatch(
      setAppSettings({
        timezone: selectedTimezone,
      })
    );
  }, [selectedTimezone]);

  useEffect(() => {
    dispatch(
      setAppSettings({
        sidebarSortAlphabetically: sortSidebar,
      })
    );
  }, [sortSidebar]);

  useEffect(() => {
    dispatch(
      setAppSettings({
        useEvict: useEvict,
      })
    );
  }, [useEvict]);

  const sidebarLabelID = 'sort-sidebar-label';
  const evictLabelID = 'use-evict-label';
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
              <NumRowsInput
                defaultValue={storedRowsPerPageOptions || defaultTableRowsPerPageOptions}
                nameLabelID={tableRowsLabelID}
              />
            ),
            nameID: tableRowsLabelID,
          },
          {
            name: t('translation|Timezone to display for dates'),
            value: (
              <Box maxWidth="350px">
                <TimezoneSelect
                  initialTimezone={selectedTimezone}
                  onChange={name => setSelectedTimezone(name)}
                  nameLabelID={timezoneLabelID}
                />
              </Box>
            ),
            nameID: timezoneLabelID,
          },
          {
            name: t('translation|Sort sidebar items alphabetically'),
            value: (
              <Switch
                color="primary"
                checked={sortSidebar}
                onChange={e => setSortSidebar(e.target.checked)}
                inputProps={{
                  'aria-labelledby': sidebarLabelID,
                }}
              />
            ),
            nameID: sidebarLabelID,
          },
          {
            name: t('translation|Use evict for pod deletion'),
            value: (
              <Switch
                color="primary"
                checked={useEvict}
                onChange={e => setUseEvict(e.target.checked)}
                inputProps={{
                  'aria-labelledby': evictLabelID,
                }}
              />
            ),
            nameID: evictLabelID,
          },
        ]}
      />
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
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') dispatch(setTheme(it.name));
                }}
                sx={{
                  cursor: 'pointer',
                  border: themeName === it.name ? '2px solid' : '1px solid',
                  borderColor: themeName === it.name ? 'primary' : 'divider',
                  borderRadius: 2,
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: '0.2 ease',
                  '&:hover': {
                    backgroundColor: 'divider',
                  },
                }}
                onClick={() => dispatch(setTheme(it.name))}
              >
                <ThemePreview theme={it} size={110} />
                <Box sx={{ mt: 1 }}>{capitalize(it.name)}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
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
