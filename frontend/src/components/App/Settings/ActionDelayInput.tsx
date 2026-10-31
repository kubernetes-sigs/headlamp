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
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { defaultActionDelay, maxActionDelay, setAppSettings } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/hooks';

const actionDelayOptions = [0, 1, 5, 10, 30];

export default function ActionDelayInput({ nameLabelID }: { nameLabelID?: string }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const actionDelay = useTypedSelector(
    state => state.config.settings.actionDelay ?? defaultActionDelay
  );
  const seconds = actionDelay / 1000;
  const maxSeconds = maxActionDelay / 1000;
  const focusedRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState(String(seconds));
  const parsedValue = Number(customValue);
  const isValid =
    customValue.trim() !== '' &&
    Number.isInteger(parsedValue) &&
    parsedValue >= 0 &&
    parsedValue <= maxSeconds;
  const options = actionDelayOptions.includes(seconds)
    ? actionDelayOptions
    : [...actionDelayOptions, seconds].sort((a, b) => a - b);
  const suggestionMsg = t('Enter a whole number of seconds between 0 and {{ maxSeconds }}.', {
    maxSeconds,
  });

  return isCustom ? (
    <Box display="inline-flex" alignItems="baseline">
      <TextField
        type="number"
        value={customValue}
        inputRef={focusedRef}
        error={customValue !== '' && !isValid}
        helperText={suggestionMsg}
        inputProps={{
          min: 0,
          max: maxSeconds,
          step: 1,
          'aria-labelledby': nameLabelID,
        }}
        onChange={event => setCustomValue(event.target.value)}
      />
      <Box display="inline-flex" alignItems="center" mx={1}>
        <Button
          variant="contained"
          size="small"
          disabled={!isValid}
          onClick={() => {
            dispatch(setAppSettings({ actionDelay: parsedValue * 1000 }));
            setIsCustom(false);
          }}
        >
          {t('Apply')}
        </Button>
        <IconButton aria-label={t('Cancel')} onClick={() => setIsCustom(false)} size="medium">
          <Icon icon="mdi:delete" />
        </IconButton>
      </Box>
    </Box>
  ) : (
    <FormControl>
      <Select
        value={seconds}
        style={{ width: '160px' }}
        size="small"
        variant="outlined"
        labelId={nameLabelID}
        onChange={event => {
          if (event.target.value === -1) {
            setCustomValue(String(seconds));
            setIsCustom(true);
          } else {
            dispatch(setAppSettings({ actionDelay: Number(event.target.value) * 1000 }));
          }
        }}
      >
        {options.map(option => (
          <MenuItem key={option} value={option}>
            {option === 0 ? t('0 (immediately)') : t('{{ count }} seconds', { count: option })}
          </MenuItem>
        ))}
        <MenuItem value={-1}>{t('Custom value')}</MenuItem>
      </Select>
    </FormControl>
  );
}
