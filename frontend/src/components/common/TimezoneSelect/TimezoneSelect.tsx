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

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import React from 'react';
import { useTranslation } from 'react-i18next';
import spacetime from 'spacetime';

export interface TimezoneSelectorProps {
  initialTimezone?: string;
  onChange: (timezone: string) => void;
  /** The custom ID to be used when this component is inside NameValueTable for ARIA labelledby */
  nameLabelID?: string;
}

export default function TimezoneSelect(props: TimezoneSelectorProps) {
  const { onChange, initialTimezone, nameLabelID } = props;
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
        <TextField
          {...params}
          helperText={t('Timezone')}
          size="small"
          variant="outlined"
          inputProps={{
            ...params.inputProps,
            ...(nameLabelID ? { 'aria-labelledby': nameLabelID } : {}),
            'aria-label': nameLabelID ? undefined : t('Timezone'),
          }}
        />
      )}
      onChange={(_ev, value) => onChange(value.name)}
      value={timezoneOptions.find(option => option.name === initialTimezone)}
    />
  );
}
