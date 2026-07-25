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

describe('configSlice storage initialization', () => {
  async function expectDefaultSettings() {
    const { initialState, defaultTableRowsPerPageOptions } = await import('./configSlice');

    expect(initialState.settings.tableRowsPerPageOptions).toEqual(defaultTableRowsPerPageOptions);
    expect(initialState.settings.timezone).toBe('UTC');
    expect(initialState.settings.sidebarSortAlphabetically).toBe(false);
    expect(initialState.settings.useEvict).toBe(true);
  }

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('falls back to defaults when localStorage settings is invalid JSON', async () => {
    localStorage.setItem('settings', '{ invalid json [');

    await expectDefaultSettings();
  });

  it.each([
    ['null', 'null'],
    ['string', '"hello"'],
    ['number', '123'],
    ['array', '[1,2,3]'],
  ])(
    'falls back to defaults when localStorage settings parses as %s',
    async (_type, settingsValue) => {
      localStorage.setItem('settings', settingsValue);

      await expectDefaultSettings();
    }
  );

  it('sanitizes object settings and keeps only known, valid keys', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        tableRowsPerPageOptions: 'abc',
        timezone: 123,
        sidebarSortAlphabetically: 'nope',
        useEvict: 'yes',
        unknownKey: 'unknown',
      })
    );

    await expectDefaultSettings();
    const { initialState } = await import('./configSlice');
    expect(initialState.settings.unknownKey).toBeUndefined();
  });

  it('uses valid typed settings from storage', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        tableRowsPerPageOptions: [10, 20, 30],
        timezone: 'Asia/Kolkata',
        sidebarSortAlphabetically: true,
        useEvict: false,
      })
    );

    const { initialState } = await import('./configSlice');

    expect(initialState.settings.tableRowsPerPageOptions).toEqual([10, 20, 30]);
    expect(initialState.settings.timezone).toBe('Asia/Kolkata');
    expect(initialState.settings.sidebarSortAlphabetically).toBe(true);
    expect(initialState.settings.useEvict).toBe(false);
  });

  it('falls back to default timezone when stored timezone is an invalid IANA string', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        timezone: 'Not/A_Real_Time_Zone',
      })
    );

    const { initialState } = await import('./configSlice');

    expect(initialState.settings.timezone).toBe('UTC');
  });
});
