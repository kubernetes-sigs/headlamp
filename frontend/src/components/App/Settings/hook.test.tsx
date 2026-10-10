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
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAppSettings } from '../../../redux/configSlice';
import reducers from '../../../redux/reducers/reducers';
import { useSettings } from './hook';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('updates when config settings change in the store', async () => {
    const store = configureStore({
      reducer: reducers,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useSettings('timezone'), {
      wrapper,
    });

    expect(result.current).toBeTruthy();

    act(() => {
      store.dispatch(setAppSettings({ timezone: 'America/Los_Angeles' }));
    });

    await waitFor(() => {
      expect(result.current).toBe('America/Los_Angeles');
    });
  });
});
