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

import { act, renderHook } from '@testing-library/react';
import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates state across multiple hooks when useLocalStorageState.update is called after re-render', () => {
    const { result: result1, rerender: rerender1 } = renderHook(() =>
      useLocalStorageState('test-key-2', 'default')
    );
    const { result: result2 } = renderHook(() => useLocalStorageState('test-key-2', 'default'));

    // Force a re-render of one hook to simulate a component update
    // This is to verify the stale-closure bug is fixed.
    rerender1();

    act(() => {
      useLocalStorageState.update('test-key-2', 'updated-via-static');
    });

    expect(result1.current[0]).toBe('updated-via-static');
    expect(result2.current[0]).toBe('updated-via-static');
    expect(localStorage.getItem('test-key-2')).toBe(JSON.stringify('updated-via-static'));
  });
});
