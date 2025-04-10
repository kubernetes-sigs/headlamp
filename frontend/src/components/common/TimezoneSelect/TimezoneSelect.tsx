import { TextField } from '@mui/material';
import { Autocomplete } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import spacetime from 'spacetime';

export interface TimezoneSelectorProps {
  initialTimezone?: string;
  onChange: (timezone: string) => void;
}

export default function TimezoneSelect(props: TimezoneSelectorProps) {
  const { onChange, initialTimezone } = props;
  const { i18n, t } = useTranslation();
  const timezoneOptions = React.useMemo(() => {
    const timezoneNames = spacetime.timezones();
    return Object.keys(timezoneNames).map(name => {
      const timezone = spacetime.now(name).timezone();
      return {
        name: timezone.name,
        offset: timezone.current.offset,
      };
    });
  }, [i18n.language]);

  return (
    <Autocomplete
      id="cluster-selector-autocomplete"
      options={timezoneOptions}
      getOptionLabel={option =>
        `(UTC${option.offset >= 0 ? '+' : ''}${option.offset}) ${option.name}`
      }
      disableClearable
      autoComplete
      includeInputInList
      openOnFocus
      renderInput={params => (
        <TextField {...params} helperText={t('Timezone')} size="small" variant="outlined" />
      )}
      onChange={(_ev, value) => onChange(value.name)}
      value={timezoneOptions.find(option => option.name === initialTimezone)}
    />
  );
}
