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
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import { capitalize } from 'lodash';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import LocaleSelect from '../../../i18n/LocaleSelect/LocaleSelect';
import { setAppSettings } from '../../../redux/configSlice';
import { defaultTableRowsPerPageOptions } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { uiSlice } from '../../../redux/uiSlice';
import { ActionButton, NameValueTable, SectionBox } from '../../common';
import TimezoneSelect from '../../common/TimezoneSelect';
import { setTheme, useAppThemes } from '../themeSlice';
import DrawerModeSettings from './DrawerModeSettings';
import { useSettings } from './hook';
import NumRowsInput from './NumRowsInput';
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
            name: t('translation|Theme'),
            value: (
              <Select
                variant="outlined"
                size="small"
                defaultValue={themeName}
                onChange={e => {
                  dispatch(setTheme(e.target.value as string));
                  console.log(e, e.target.value);
                }}
              >
                {appThemes.map(it => (
                  <MenuItem key={it.name} value={it.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ThemePreview theme={it} />
                      {capitalize(it.name)}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            ),
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
              />
            ),
          },
          {
            name: t('translation|Timezone to display for dates'),
            value: (
              <Box maxWidth="350px">
                <TimezoneSelect
                  initialTimezone={selectedTimezone}
                  onChange={name => setSelectedTimezone(name)}
                />
              </Box>
            ),
          },
          {
            name: t('translation|Sort sidebar items alphabetically'),
            value: (
              <Switch
                color="primary"
                checked={sortSidebar}
                onChange={e => setSortSidebar(e.target.checked)}
              />
            ),
          },
          {
            name: t('translation|Use evict for pod deletion'),
            value: (
              <Switch
                color="primary"
                checked={useEvict}
                onChange={e => setUseEvict(e.target.checked)}
              />
            ),
          },
        ]}
      />
    </SectionBox>
  );
}
