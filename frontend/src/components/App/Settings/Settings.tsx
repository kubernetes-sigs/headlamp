import { Box, MenuItem, Select } from '@mui/material';
import { capitalize } from 'lodash';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import LocaleSelect from '../../../i18n/LocaleSelect/LocaleSelect';
import { setVersionDialogOpen } from '../../../redux/actions/actions';
import { setAppSettings } from '../../../redux/configSlice';
import { defaultTableRowsPerPageOptions } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
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
  const [selectedTimezone, setSelectedTimezone] = useState<string>(
    storedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
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
              dispatch(setVersionDialogOpen(true));
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
        ]}
      />
    </SectionBox>
  );
}
