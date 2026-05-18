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
import { Router } from 'react-router-dom';
import { useQueryParamsState } from './useQueryParamsState';

describe('useQueryParamsState', () => {
  it('should initialize with the initial state if no query param is present', () => {
    const history = createMemoryHistory();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>{children}</Router>
    );

    const { result } = renderHook(() => useQueryParamsState('test', 'initial'), { wrapper });

    expect(result.current[0]).toBe('initial');
    expect(history.length).toBe(1); // make sure it's replaced and not appended
  });

  it('should initialize with the query param value if present', () => {
    const history = createMemoryHistory();
    history.replace('?test=value');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>{children}</Router>
    );

    const { result } = renderHook(() => useQueryParamsState('test', 'initial'), { wrapper });

    expect(result.current[0]).toBe('value');
    expect(history.length).toBe(1);
  });

  it('should update the query param value', () => {
    const history = createMemoryHistory();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>{children}</Router>
    );

    const { result } = renderHook(() => useQueryParamsState<string>('test', 'initial'), {
      wrapper,
    });

    act(() => {
      result.current[1]('new-value');
    });

    expect(history.location.search).toBe('?test=new-value');
    expect(result.current[0]).toBe('new-value');
    expect(history.length).toBe(2);
  });

  it('should remove the query param if the new value is undefined', () => {
    const history = createMemoryHistory();
    history.replace('?test=value');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>{children}</Router>
    );

    const { result } = renderHook(() => useQueryParamsState('test', 'initial'), { wrapper });

    act(() => {
      result.current[1](undefined);
    });

    expect(history.location.search).toBe('');
    expect(result.current[0]).toBeUndefined();
    expect(history.length).toBe(2);
  });

  it('should replace the query param value if replace option is true', () => {
    const history = createMemoryHistory();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>{children}</Router>
    );

    const { result } = renderHook(() => useQueryParamsState<string>('test', 'initial'), {
      wrapper,
    });

    act(() => {
      result.current[1]('new-value', { replace: true });
    });

    expect(history.location.search).toBe('?test=new-value');
    expect(result.current[0]).toBe('new-value');
    expect(history.length).toBe(1);
  });
});
