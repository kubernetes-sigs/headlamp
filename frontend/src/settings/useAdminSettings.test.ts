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

import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { storeClusterSettings } from '../helpers/clusterSettings';
import configReducer, { initialState, setAppSettings } from '../redux/configSlice';
import reducers from '../redux/reducers/reducers';
import type { RootState } from '../redux/stores/store';
import { initialAdminSettingsState } from './adminSettingsSlice';
import { applyAdminSettings, parseAdminSettings } from './parseAdminSettings';
import { selectEffectiveSettings, useSetting } from './useAdminSettings';

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

describe('useSetting cluster-local reactivity', () => {
  beforeEach(() => localStorage.clear());

  it('invalidates mounted cluster consumers when local cluster settings change', () => {
    const testStore = configureStore({
      reducer: reducers,
      preloadedState: {
        adminSettings: {
          ...initialAdminSettingsState,
          defaults: {
            clusters: {
              '*': {
                allowedNamespaces: ['admin-default'],
              },
            },
          },
        },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store: testStore, children });

    storeClusterSettings('prod', { allowedNamespaces: ['ns-one', 'ns-two'] });
    const { result } = renderHook(
      () => useSetting<string[]>('clusters.*.allowedNamespaces', 'prod'),
      {
        wrapper,
      }
    );
    expect(result.current.value).toEqual(['ns-one', 'ns-two']);

    act(() => storeClusterSettings('prod', { allowedNamespaces: ['ns-one'] }));
    expect(result.current.value).toEqual(['ns-one']);

    act(() => storeClusterSettings('prod', { allowedNamespaces: [] }));
    expect(result.current.value).toEqual(['admin-default']);
  });

  it('preserves Redux user and built-in fallbacks for non-cluster settings when clusterName is provided', () => {
    const testStore = configureStore({
      reducer: reducers,
      preloadedState: {
        config: configReducer(initialState, setAppSettings({ timezone: 'Europe/Lisbon' })),
        adminSettings: initialAdminSettingsState,
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store: testStore, children });

    const { result: userResult } = renderHook(() => useSetting<string>('timezone', 'prod'), {
      wrapper,
    });
    expect(userResult.current.value).toBe('Europe/Lisbon');

    const { result: builtInResult } = renderHook(() => useSetting<boolean>('useEvict', 'prod'), {
      wrapper,
    });
    expect(builtInResult.current.value).toBe(initialState.settings.useEvict);
  });
});
