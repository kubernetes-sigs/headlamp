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
import { createMemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router';
import { useURLState } from './util';

function setup(initial = '/?page=2') {
  const history = createMemoryHistory({ initialEntries: [initial] });
  const wrapper = ({ children }: React.PropsWithChildren) => (
    <Router history={history}>{children}</Router>
  );
  return { history, wrapper };
}

describe('useURLState navigation', () => {
  it('updates its value when the query changes and on back/forward navigation', () => {
    const { history, wrapper } = setup();
    const { result } = renderHook(() => useURLState('page', 1), { wrapper });
    expect(result.current[0]).toBe(2);
    act(() => history.push('/?page=3'));
    expect(result.current[0]).toBe(3);
    act(() => history.goBack());
    expect(result.current[0]).toBe(2);
    act(() => history.goForward());
    expect(result.current[0]).toBe(3);
  });

  it('restores the default when navigation removes its query parameter', () => {
    const { history, wrapper } = setup();
    const { result } = renderHook(() => useURLState('page', 1), { wrapper });
    act(() => history.push('/?unrelated=kept'));
    expect(result.current[0]).toBe(1);
    expect(history.location.search).toBe('?unrelated=kept');
  });

  it('removes a query parameter when its state returns to the hidden default', () => {
    const { history, wrapper } = setup('/?page=2&unrelated=kept');
    const { result } = renderHook(() => useURLState('page', 1), { wrapper });
    act(() => result.current[1](1));
    expect(new URLSearchParams(history.location.search).has('page')).toBe(false);
    expect(new URLSearchParams(history.location.search).get('unrelated')).toBe('kept');
  });

  it('parses numeric query values and restores the default for invalid values', () => {
    const { history, wrapper } = setup('/?page=2');
    const { result } = renderHook(() => useURLState('page', 1), { wrapper });
    expect(result.current[0]).toBe(2);
    act(() => history.push('/?page=3'));
    expect(result.current[0]).toBe(3);
    act(() => history.push('/?page=invalid'));
    expect(result.current[0]).toBe(1);
  });

  it('keeps plain local state on navigation when its URL key is empty', () => {
    const { history, wrapper } = setup();
    const { result } = renderHook(() => useURLState('', 1), { wrapper });
    act(() => result.current[1](2));
    act(() => history.push('/?page=3'));
    expect(result.current[0]).toBe(2);
    expect(history.location.search).toBe('?page=3');
  });

  it('honors a prefixed key while preserving other URL state', () => {
    const { history, wrapper } = setup('/?table.page=2&filter=kept');
    const { result } = renderHook(
      () => useURLState('page', { defaultValue: 1, prefix: 'table', hideDefault: false }),
      { wrapper }
    );
    act(() => history.push('/?table.page=3&filter=kept'));
    expect(result.current[0]).toBe(3);
    act(() => result.current[1](1));
    expect(new URLSearchParams(history.location.search).get('table.page')).toBe('1');
    expect(new URLSearchParams(history.location.search).get('filter')).toBe('kept');
  });
});
