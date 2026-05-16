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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSavedAdvancedSearch,
  deleteSavedAdvancedSearch,
  readSavedAdvancedSearches,
  renameSavedAdvancedSearch,
  SAVED_ADVANCED_SEARCHES_KEY,
} from './savedAdvancedSearches';

describe('savedSearches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads an empty list when localStorage is empty or invalid', () => {
    expect(readSavedAdvancedSearches()).toEqual([]);

    localStorage.setItem(SAVED_ADVANCED_SEARCHES_KEY, '{invalid json');

    expect(readSavedAdvancedSearches()).toEqual([]);
  });

  it('filters invalid saved searches from localStorage', () => {
    localStorage.setItem(
      SAVED_ADVANCED_SEARCHES_KEY,
      JSON.stringify([
        {
          id: 'saved-1',
          name: ' Unhealthy pods ',
          query: 'status.phase !== "Running"',
          resources: 'v1/pods',
          namespaces: ['default', 'default', 1],
          createdAt: 1,
        },
        {
          id: 'missing-query',
          name: 'Broken',
          resources: 'all',
          createdAt: 2,
        },
      ])
    );

    expect(readSavedAdvancedSearches()).toEqual([
      {
        id: 'saved-1',
        name: 'Unhealthy pods',
        query: 'status.phase !== "Running"',
        resources: 'v1/pods',
        namespaces: ['default'],
        createdAt: 1,
      },
    ]);
  });

  it('adds a saved search to the front of the list', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'));

    try {
      const searches = addSavedAdvancedSearch(
        [
          {
            id: 'saved-1',
            name: 'Existing',
            query: 'true',
            resources: 'all',
            namespaces: [],
            createdAt: 1,
          },
        ],
        {
          name: ' New search ',
          query: ' metadata.name === "nginx" ',
          resources: '',
          namespaces: ['default', 'default'],
        }
      );

      expect(searches).toHaveLength(2);
      expect(searches[0]).toMatchObject({
        name: 'New search',
        query: 'metadata.name === "nginx"',
        resources: '',
        namespaces: ['default'],
        createdAt: Date.parse('2026-05-14T00:00:00.000Z'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add a saved search without a name or query', () => {
    const searches = [
      {
        id: 'saved-1',
        name: 'Existing',
        query: 'true',
        resources: 'all',
        namespaces: [],
        createdAt: 1,
      },
    ];

    expect(
      addSavedAdvancedSearch(searches, {
        name: '',
        query: 'true',
        resources: 'all',
        namespaces: [],
      })
    ).toBe(searches);
    expect(
      addSavedAdvancedSearch(searches, {
        name: 'Name',
        query: '',
        resources: 'all',
        namespaces: [],
      })
    ).toBe(searches);
  });

  it('renames and deletes saved searches', () => {
    const searches = [
      {
        id: 'saved-1',
        name: 'Existing',
        query: 'true',
        resources: 'all',
        namespaces: [],
        createdAt: 1,
      },
    ];

    expect(renameSavedAdvancedSearch(searches, 'saved-1', ' Updated ')).toEqual([
      {
        ...searches[0],
        name: 'Updated',
      },
    ]);
    expect(renameSavedAdvancedSearch(searches, 'saved-1', '')).toBe(searches);
    expect(deleteSavedAdvancedSearch(searches, 'saved-1')).toEqual([]);
  });
});
