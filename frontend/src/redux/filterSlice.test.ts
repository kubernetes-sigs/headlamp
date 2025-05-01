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

import filterReducer, {
  FilterState,
  initialState,
  resetFilter,
  setNamespaceFilter,
} from './filterSlice';

describe('filterSlice', () => {
  let state: FilterState;

  beforeEach(() => {
    state = initialState;
  });

  it('should handle setNamespaceFilter', () => {
    const namespaces = ['default', 'kube-system'];
    state = filterReducer(state, setNamespaceFilter(namespaces));
    expect(state.namespaces).toEqual(new Set(namespaces));
  });

  it('should handle resetFilter', () => {
    state = {
      ...state,
      namespaces: new Set(['default']),
    };

    state = filterReducer(state, resetFilter());
    expect(state).toEqual(initialState);
  });
});
