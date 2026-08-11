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

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setAppSettings } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/hooks';

export default function WebsocketModeSettings({ nameLabelID }: { nameLabelID?: string }) {
  const { t } = useTranslation(['translation']);
  const dispatch = useDispatch();
  const userOverride = useTypedSelector(
    state => state.config.settings.websocketModeUserOverride ?? 'auto'
  );

  function handleChange(value: unknown) {
    const valid = new Set(['websockets', 'off', 'multiplexer', 'auto']);
    const next = typeof value === 'string' && valid.has(value) ? value : 'auto';
    dispatch(
      setAppSettings({
        websocketModeUserOverride: next as 'websockets' | 'off' | 'multiplexer' | 'auto',
      })
    );
  }

  return (
    <Select
      value={userOverride}
      onChange={e => handleChange(e.target.value)}
      size="small"
      sx={{ minWidth: 200 }}
      labelId={nameLabelID}
      inputProps={{ 'aria-label': undefined }}
    >
      <MenuItem value="auto">
        {t('translation|Default (use environment / server setting)')}
      </MenuItem>
      <MenuItem value="websockets">{t('translation|Websockets (standard)')}</MenuItem>
      <MenuItem value="multiplexer">
        {t('translation|Multiplexer (experimental, improved performance)')}
      </MenuItem>
      <MenuItem value="off">{t('translation|Off (disable real-time updates)')}</MenuItem>
    </Select>
  );
}
