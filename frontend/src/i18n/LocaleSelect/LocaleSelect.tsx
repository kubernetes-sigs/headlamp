import FormControl, { FormControlProps } from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../config';

/**
 * Interface for the props used by the `LocaleSelect` component, which is responsible for rendering a locale selection UI.
 *
 * @param showTitle - Optional flag to control whether the title of the locale selector is displayed. Defaults to `false`.
 * @param showFullNames - Optional flag to control whether to display full language names instead of language codes. Defaults to `false`.
 * @param formControlProps - Optional properties to customize the `FormControl` component used for the locale selection.
 */
export interface LocaleSelectProps {
  showTitle?: boolean;
  showFullNames?: boolean;
  formControlProps?: FormControlProps;
}

/**
 * A component that provides a UI for selecting the locale with `i18next`, allowing users to switch languages in the application.
 * It uses Material UI components such as `FormControl`, `Select`, and `MenuItem` to render a dropdown for selecting a language.
 *
 * @remarks
 * This component displays a locale selector with support for showing either the language code or the full language name,
 * depending on the `showFullNames` prop. It also listens for language changes via the `i18next` library and updates the UI accordingly.
 *
 * @param props - The properties for the `LocaleSelect` component.
 * @param props.showTitle - Optional flag to show the title of the locale selection. Defaults to `false`.
 * @param props.showFullNames - Optional flag to show the full names of the languages instead of their abbreviations. Defaults to `false`.
 * @param props.formControlProps - Optional props for customizing the `FormControl` component used within the selector.
 *
 * @returns A `FormControl` component containing a `Select` dropdown for changing the app's language.
 *
 * @example
 * ```tsx
 * <LocaleSelect showTitle={true} showFullNames={true} />
 * ```
 */
export default function LocaleSelect(props: LocaleSelectProps) {
  const { formControlProps, showFullNames } = props;
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const fullNames = React.useMemo(() => {
    if (!showFullNames) {
      return {};
    }

    return getFullNames();
  }, [showFullNames]);

  const changeLng = (event: SelectChangeEvent<string>) => {
    const lng = event.target.value as string;

    i18n.changeLanguage(lng);
    theme.direction = i18n.dir();
  };

  function getFullNames() {
    if (!i18n?.options?.supportedLngs) {
      return {};
    }

    const fullNames: { [langCore: string]: string } = {};
    i18n?.options?.supportedLngs.forEach((lng: string) => {
      if (!lng) {
        return;
      }

      fullNames[lng] = supportedLanguages[lng] || lng;
    });

    return fullNames;
  }

  // Select has a problem with aria-controls not being stable under test.
  const extraInputProps = import.meta.env.UNDER_TEST ? { 'aria-controls': 'under-test' } : {};

  return (
    <FormControl {...formControlProps}>
      {props.showTitle && <FormLabel component="legend">{t('Select locale')}</FormLabel>}
      <Select
        value={i18n.language ? i18n.language : 'en'}
        onChange={changeLng}
        size="small"
        variant="outlined"
        SelectDisplayProps={extraInputProps}
        inputProps={{ 'aria-label': t('Select locale'), ...extraInputProps }}
      >
        {(i18n?.options?.supportedLngs || [])
          .filter(lng => lng !== 'cimode')
          .map(lng => (
            <MenuItem value={lng} key={lng}>
              {showFullNames ? fullNames[lng] : lng}
            </MenuItem>
          ))}
      </Select>
    </FormControl>
  );
}
