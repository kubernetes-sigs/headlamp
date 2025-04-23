import { Box, Switch } from '@mui/material';
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
  const storedSortSidebar = settingsObj.sidebarSortAlphabetically;
  const [selectedTimezone, setSelectedTimezone] = useState<string>(
    storedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [sortSidebar, setSortSidebar] = useState<boolean>(storedSortSidebar);
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
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: 2,
                }}
              >
                {appThemes.map(it => (
                  <Box
                    key={it.name}
                    sx={{
                      cursor: 'pointer',
                      border: themeName === it.name ? '2px solid' : '1px solid #ccc',
                      borderRadius: 2,
                      p: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      transition: '0.2 ease',
                      '&:hover': {
                        boxShadow: '0 0 8px rgba(0,0,0,0.2)',
                      },
                    }}
                    onClick={() => dispatch(setTheme(it.name))}
                  >
                    <ThemePreview theme={it} />
                    <Box sx={{ mt: 1 }}>{capitalize(it.name)}</Box>
                  </Box>
                ))}
              </Box>
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
        ]}
      />
    </SectionBox>
  );
}
