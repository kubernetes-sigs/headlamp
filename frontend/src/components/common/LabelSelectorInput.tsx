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
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { validateLabelSelector } from '../../lib/labelSelectorValidation';
import { useQueryParamsState } from '../../lib/useQueryParamsState';
import { setLabelSelectorFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';

export interface LabelSelectorInputProps {
  /** Label keys found in resources loaded by the active list. */
  labelKeys?: string[];
  /** Called after the selector is applied with the Enter key. */
  onApply?: () => void;
}

interface LabelKeySuggestion {
  key: string;
  selector: string;
}

function getLabelKeySuggestions(selector: string, labelKeys: string[]): LabelKeySuggestion[] {
  let requirementStart = 0;
  let setDepth = 0;

  for (let index = 0; index < selector.length; index++) {
    if (selector[index] === '(') {
      setDepth++;
    } else if (selector[index] === ')') {
      setDepth = Math.max(0, setDepth - 1);
    } else if (selector[index] === ',' && setDepth === 0) {
      requirementStart = index + 1;
    }
  }

  const requirement = selector.slice(requirementStart);
  const whitespace = requirement.match(/^\s*/)?.[0] ?? '';
  const negated = requirement.slice(whitespace.length).startsWith('!');
  const fragment = requirement.slice(whitespace.length + (negated ? 1 : 0));

  if (!fragment || /[\s=<>!,()]/.test(fragment)) {
    return [];
  }

  const normalizedFragment = fragment.toLocaleLowerCase();
  const prefix = selector.slice(0, requirementStart) + whitespace + (negated ? '!' : '');

  return [...new Set(labelKeys)]
    .filter(key => key.toLocaleLowerCase().startsWith(normalizedFragment) && key !== fragment)
    .sort()
    .map(key => ({ key, selector: prefix + key }));
}

export function LabelSelectorInput({ labelKeys = [], onApply }: LabelSelectorInputProps = {}) {
  const { t } = useTranslation(['glossary', 'translation']);
  const dispatch = useDispatch();
  const [labelSelectorFromURL, setLabelSelectorInURL] = useQueryParamsState<string | undefined>(
    'labelSelector',
    undefined
  );
  const labelSelector = useTypedSelector(state => state.filter.labelSelector);
  const [inputValue, setInputValue] = React.useState<string>(labelSelector);
  const [examplesOpen, setExamplesOpen] = React.useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const suggestions = React.useMemo(
    () => getLabelKeySuggestions(inputValue, labelKeys),
    [inputValue, labelKeys]
  );

  // Initialize from URL on mount
  React.useEffect(() => {
    if (labelSelectorFromURL && labelSelectorFromURL !== labelSelector) {
      dispatch(setLabelSelectorFilter(labelSelectorFromURL));
      setInputValue(labelSelectorFromURL);
    }
    // Only run on mount to initialize from URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local inputValue in sync with Redux labelSelector
  React.useEffect(() => {
    setInputValue(labelSelector);
  }, [labelSelector]);

  const handleInputChange = (_event: React.SyntheticEvent, value: string, reason: string) => {
    if (reason === 'reset') {
      return;
    }
    setInputValue(value);
    setValidationError(null);
  };

  const handleSuggestion = (_event: React.SyntheticEvent, value: string | LabelKeySuggestion) => {
    if (typeof value !== 'string') {
      setInputValue(value.selector);
      setValidationError(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (suggestionsOpen && suggestions.length > 0) {
        return;
      }
      if (applyFilter()) {
        onApply?.();
      }
    } else if (event.key === 'Escape') {
      handleClear();
    }
  };

  const applyFilter = (): boolean => {
    const trimmedValue = inputValue.trim();
    const error = validateLabelSelector(trimmedValue);
    setValidationError(error);
    if (error) {
      return false;
    }
    dispatch(setLabelSelectorFilter(trimmedValue));
    setLabelSelectorInURL(trimmedValue || undefined);
    return true;
  };

  const handleClear = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
    }
    setInputValue('');
    setValidationError(null);
    dispatch(setLabelSelectorFilter(''));
    setLabelSelectorInURL(undefined);
  };

  return (
    <Autocomplete
      autoHighlight
      disableClearable
      filterOptions={options => options}
      forcePopupIcon={false}
      freeSolo
      getOptionLabel={option => (typeof option === 'string' ? option : option.selector)}
      id="label-selector-input"
      inputValue={inputValue}
      onChange={handleSuggestion}
      onClose={() => setSuggestionsOpen(false)}
      onInputChange={handleInputChange}
      onOpen={() => setSuggestionsOpen(true)}
      open={suggestionsOpen && suggestions.length > 0}
      options={suggestions}
      renderOption={(props, option) => (
        <li {...props} key={option.key}>
          {option.key}
        </li>
      )}
      sx={{ maxWidth: '100%', width: { xs: '100%', sm: '48rem' } }}
      renderInput={params => (
        <TextField
          {...params}
          variant="outlined"
          size="small"
          label={t('translation|Label Selector')}
          error={Boolean(validationError)}
          helperText={
            validationError
              ? t('translation|Invalid label selector: {{ error }}', { error: validationError })
              : undefined
          }
          placeholder={t('translation|e.g. app=nginx')}
          onKeyDown={handleKeyDown}
          onBlur={applyFilter}
          InputLabelProps={{ shrink: true }}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip
                  arrow
                  open={examplesOpen}
                  onClose={() => setExamplesOpen(false)}
                  onOpen={() => setExamplesOpen(true)}
                  TransitionProps={{ timeout: 0 }}
                  slotProps={{
                    tooltip: {
                      sx: theme => ({
                        backgroundColor: theme.palette.background.paper,
                        border: '1px solid',
                        borderColor: theme.palette.divider,
                        boxShadow: theme.shadows[4],
                        color: theme.palette.text.primary,
                        maxWidth: 'none',
                      }),
                    },
                    arrow: {
                      sx: theme => ({
                        color: theme.palette.background.paper,
                      }),
                    },
                  }}
                  title={
                    <Box sx={{ p: 0.5 }}>
                      <Box component="strong">{t('translation|Examples')}</Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        app=nginx
                      </Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        tier!=backend
                      </Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        env in (production,staging)
                      </Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        env notin (dev)
                      </Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        partition
                      </Box>
                      <Box component="code" sx={{ display: 'block' }}>
                        !partition
                      </Box>
                    </Box>
                  }
                >
                  <IconButton
                    size="small"
                    aria-label={`${t('translation|Label Selector')}: ${t('translation|Examples')}`}
                    onBlur={() => setExamplesOpen(false)}
                    onClick={() => setExamplesOpen(true)}
                    onFocus={() => setExamplesOpen(true)}
                  >
                    <Icon icon="mdi:information-outline" width="1.2rem" height="1.2rem" />
                  </IconButton>
                </Tooltip>
                {inputValue && (
                  <Tooltip title={t('translation|Clear') as string}>
                    <IconButton
                      size="small"
                      onMouseDown={handleClear}
                      edge="end"
                      aria-label={t('translation|Clear') as string}
                    >
                      <Icon icon="mdi:close" width="1.2rem" height="1.2rem" />
                    </IconButton>
                  </Tooltip>
                )}
              </InputAdornment>
            ),
          }}
        />
      )}
    />
  );
}
