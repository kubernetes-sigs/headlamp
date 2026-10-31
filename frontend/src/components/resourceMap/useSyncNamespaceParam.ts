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

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useQueryParamsState } from './useQueryParamsState';

/**
 * Synchronizes the 'namespace' query parameter from the URL to the global Redux namespace filter.
 *
 * When the 'namespace' parameter is present in the URL, it splits the value on spaces and
 * updates the namespace filter. When the parameter is absent (undefined), existing filter
 * selections are preserved untouched.
 */
export function useSyncNamespaceParam() {
  const dispatch = useDispatch();
  const [namespacesParam] = useQueryParamsState<string>('namespace', '');

  useEffect(() => {
    if (namespacesParam !== undefined) {
      const list = namespacesParam.split(' ');
      dispatch(setNamespaceFilter(list));
    }
  }, [namespacesParam, dispatch]);
}
