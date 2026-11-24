/*
 * Copyright 2026 The Kubernetes Authors
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

import configReducer, { initialState, setAppSettings } from '../redux/configSlice';
import type { RootState } from '../redux/stores/store';
import { initialAdminSettingsState } from './adminSettingsSlice';
import { applyAdminSettings, parseAdminSettings } from './parseAdminSettings';
import { selectEffectiveSettings } from './useAdminSettings';

const admin = applyAdminSettings(
  parseAdminSettings({
    defaults: {
      tableRowsPerPageOptions: [7, 14],
      timezone: { $value: 'Asia/Tokyo', $display: 'disabled' },
    },
  })
);

function state(config = initialState, adminSettings = admin): RootState {
  return { config, adminSettings } as RootState;
}

describe('selectEffectiveSettings', () => {
  beforeEach(() => localStorage.clear());

  it('uses admin defaults for settings the user never set', () => {
    const settings = selectEffectiveSettings(state());
    expect(settings.tableRowsPerPageOptions).toEqual([7, 14]);
    expect(settings.timezone).toEqual('Asia/Tokyo');
    expect(settings.useEvict).toBe(true);
  });

  it('lets a user choice beat the admin default but not a disabled setting', () => {
    const config = [
      setAppSettings({ tableRowsPerPageOptions: [30] }),
      setAppSettings({ timezone: 'Europe/Lisbon' }),
    ].reduce(configReducer, initialState);

    const settings = selectEffectiveSettings(state(config));
    expect(settings.tableRowsPerPageOptions).toEqual([30]);
    expect(settings.timezone).toEqual('Asia/Tokyo');
  });

  it('falls back to user and built-in values without admin settings', () => {
    const config = configReducer(initialState, setAppSettings({ useEvict: false }));
    const settings = selectEffectiveSettings(state(config, initialAdminSettingsState));
    expect(settings.useEvict).toBe(false);
    expect(settings.tableRowsPerPageOptions).toEqual(initialState.settings.tableRowsPerPageOptions);
  });
});
