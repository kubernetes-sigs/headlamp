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
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { addQueryParams, getFilterValueFromURL } from '../../lib/urlUtils';
import { setLabelSelectorFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';

export function LabelSelectorInput() {
  const { t } = useTranslation(['glossary', 'translation']);
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const labelSelector = useTypedSelector(state => state.filter.labelSelector);
  const [inputValue, setInputValue] = React.useState<string>(labelSelector);

  // Initialize from URL on mount
  React.useEffect(() => {
    const labelSelectorFromURL = getFilterValueFromURL('labelSelector', location);
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      applyFilter();
    } else if (event.key === 'Escape') {
      handleClear();
    }
  };

  const applyFilter = () => {
    const trimmedValue = inputValue.trim();
    dispatch(setLabelSelectorFilter(trimmedValue));
    addQueryParams({ labelSelector: trimmedValue }, { labelSelector: '' }, history, location);
  };

  const handleClear = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
    }
    setInputValue('');
    dispatch(setLabelSelectorFilter(''));
    addQueryParams({ labelSelector: '' }, { labelSelector: '' }, history, location);
  };

  return (
    <TextField
      id="label-selector-input"
      variant="outlined"
      size="small"
      label={t('translation|Label Selector')}
      placeholder={t('translation|e.g. app=nginx')}
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={applyFilter}
      style={{ width: '15rem' }}
      InputLabelProps={{ shrink: true }}
      InputProps={{
        endAdornment: inputValue ? (
          <InputAdornment position="end">
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
          </InputAdornment>
        ) : null,
      }}
    />
  );
}
