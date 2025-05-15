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

import { useCallback, useEffect, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router';

type UseQueryParamsStateReturnType<T> = [
  T | undefined,
  (newValue: T | undefined, params?: { replace?: boolean }) => void
];

/**
 * Custom hook to manage a state synchronized with a URL query parameter
 *
 * @param param - The name of the query parameter to synchronize with
 * @param initialState - The initial state value
 * @returns A tuple containing the current state value and a function to update the state value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useQueryParamsState('search', 'initial-value')
 *
 */
export function useQueryParamsState<T extends string | undefined>(
  param: string,
  initialState: T
): UseQueryParamsStateReturnType<T> {
  const { search } = useLocation();
  const history = useHistory();

  const value = useMemo(() => {
    const params = new URLSearchParams(search);
    return (params.get(param) ?? undefined) as T | undefined;
  }, [search, param]);

  const setValue = useCallback(
    (newValue: T | undefined, params: { replace?: boolean } = {}) => {
      if (newValue !== undefined && typeof newValue !== 'string') {
        throw new Error("useQueryParamsState: Can't set a value to something that isn't a string");
      }

      // Create new search params
      const newParams = new URLSearchParams(history.location.search);
      if (newValue === undefined) {
        newParams.delete(param);
      } else {
        newParams.set(param, newValue);
      }

      // Apply new search params
      const newSearch = '?' + newParams;
      if (params.replace) {
        history.replace(newSearch);
      } else {
        history.push(newSearch);
      }
    },
    [history.location.search, param]
  );

  // Apply initialState if any
  useEffect(() => {
    if (initialState && !value) {
      setValue(initialState, { replace: true });
    }
  }, [initialState]);

  return [value, setValue];
}
