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

import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import configReducer, { initialState, setAppSettings } from '../../../redux/configSlice';
import { useSettings } from './hook';

function createStore() {
  return configureStore({
    reducer: { config: configReducer },
    preloadedState: {
      config: {
        ...initialState,
        settings: { ...initialState.settings, timezone: 'UTC' },
      },
    },
  });
}

function createWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe('useSettings', () => {
  afterEach(() => localStorage.removeItem('settings'));

  it('returns the updated selected setting after the Redux value changes', () => {
    const store = createStore();
    const { result } = renderHook(() => useSettings('timezone'), {
      wrapper: createWrapper(store),
    });

    expect(result.current).toBe('UTC');

    act(() => {
      store.dispatch(setAppSettings({ timezone: 'America/Los_Angeles' }));
    });

    expect(result.current).toBe('America/Los_Angeles');
  });
});
