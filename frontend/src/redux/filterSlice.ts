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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { JSONPath } from 'jsonpath-plus';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { KubeEvent } from '../lib/k8s/event';
import { KubeObjectInterface } from '../lib/k8s/KubeObject';

export interface FilterState {
  /** The namespaces to filter on. */
  namespaces: Set<string>;
}

export const initialState: FilterState = {
  namespaces: new Set(),
};

/**
 * Filters a resource based on the filter state.
 *
 * @param item - The item to filter.
 * @param filter - The filter state.
 * @param matchCriteria - The JSONPath criteria to match.
 *
 * @returns True if the item matches the filter, false otherwise.
 */
export function filterResource(
  item: KubeObjectInterface | KubeEvent,
  filter: FilterState,
  search?: string,
  matchCriteria?: string[]
) {
  let matches: boolean = true;

  if (item.metadata.namespace && filter.namespaces.size > 0) {
    matches = filter.namespaces.has(item.metadata.namespace);
  }

  if (!matches) {
    return false;
  }

  if (search) {
    const filterString = search.toLowerCase();
    const usedMatchCriteria = [
      item.metadata.uid.toLowerCase(),
      item.metadata.namespace ? item.metadata.namespace.toLowerCase() : '',
      item.metadata.name.toLowerCase(),
      ...Object.keys(item.metadata.labels || {}).map(item => item.toLowerCase()),
      ...Object.values(item.metadata.labels || {}).map(item => item.toLowerCase()),
    ];

    matches = !!usedMatchCriteria.find(item => item.includes(filterString));
    if (matches) {
      return true;
    }

    matches = filterGeneric(item, search, matchCriteria);
  }

  return matches;
}

/**
 * Filters a generic item based on the filter state.
 *
 * The item is considered to match if any of the matchCriteria (described as JSONPath)
 * matches the filter.search contents. Case matching is insensitive.
 *
 * @param item - The item to filter.
 * @param filter - The filter state.
 * @param matchCriteria - The JSONPath criteria to match.
 */
export function filterGeneric<T extends { [key: string]: any } = { [key: string]: any }>(
  item: T,
  search?: string,
  matchCriteria?: string[]
) {
  if (!search) {
    return true;
  }

  const filterString = search.toLowerCase();
  const usedMatchCriteria: string[] = [];

  // Use the custom matchCriteria if any
  (matchCriteria || []).forEach(jsonPath => {
    let values: any[];
    try {
      values = JSONPath({ path: '$' + jsonPath, json: item });
    } catch (err) {
      console.debug(
        `Failed to get value from JSONPath when filtering ${jsonPath} on item ${item}; skipping criteria`
      );
      return;
    }

    // Include matches values in the criteria
    values.forEach((value: any) => {
      if (typeof value === 'string' || typeof value === 'number') {
        // Don't use empty string, otherwise it'll match everything
        if (value !== '') {
          usedMatchCriteria.push(value.toString().toLowerCase());
        }
      } else if (Array.isArray(value)) {
        value.forEach((elem: any) => {
          if (!!elem && typeof elem === 'string') {
            usedMatchCriteria.push(elem.toLowerCase());
          }
        });
      }
    });
  });

  return !!usedMatchCriteria.find(item => item.includes(filterString));
}

const filterSlice = createSlice({
  name: 'filter',
  initialState,
  reducers: {
    /**
     * Sets the namespace filter with an array of strings.
     */
    setNamespaceFilter(state, action: PayloadAction<string[]>) {
      state.namespaces = new Set(action.payload);
    },
    /**
     * Resets the filter state.
     */
    resetFilter(state) {
      state.namespaces = new Set();
    },
  },
});

export const { setNamespaceFilter, resetFilter } = filterSlice.actions;

export default filterSlice.reducer;

/**
 * Get globally selected namespaces
 *
 * @returns An array of selected namespaces, empty means all namespaces are visible
 */
export const useNamespaces = () => {
  const namespacesSet = useSelector(({ filter }: { filter: FilterState }) => filter.namespaces);
  return useMemo(() => [...namespacesSet], [namespacesSet]);
};
