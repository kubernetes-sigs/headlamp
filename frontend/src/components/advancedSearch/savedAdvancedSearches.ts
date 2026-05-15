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

export const SAVED_ADVANCED_SEARCHES_KEY = 'advanced-search-saved-queries';

export interface SavedAdvancedSearch {
  id: string;
  name: string;
  query: string;
  resources: string | 'all';
  namespaces: string[];
  createdAt: number;
}

export type SavedAdvancedSearchInput = Omit<SavedAdvancedSearch, 'id' | 'createdAt'>;

export const MAX_SAVED_ADVANCED_SEARCHES = 50;

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}

function normalizeSavedSearch(value: unknown): SavedAdvancedSearch | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeSearch = value as Partial<SavedAdvancedSearch>;
  if (
    typeof maybeSearch.id !== 'string' ||
    typeof maybeSearch.name !== 'string' ||
    typeof maybeSearch.query !== 'string' ||
    typeof maybeSearch.resources !== 'string' ||
    typeof maybeSearch.createdAt !== 'number'
  ) {
    return null;
  }

  return {
    id: maybeSearch.id,
    name: maybeSearch.name.trim(),
    query: maybeSearch.query,
    resources: maybeSearch.resources,
    namespaces: uniqueStrings(maybeSearch.namespaces),
    createdAt: maybeSearch.createdAt,
  };
}

export function normalizeSavedSearchInput(
  input: SavedAdvancedSearchInput
): SavedAdvancedSearchInput {
  return {
    name: input.name.trim(),
    query: input.query.trim(),
    resources: input.resources,
    namespaces: uniqueStrings(input.namespaces),
  };
}

export function readSavedAdvancedSearches(storage: Storage = localStorage): SavedAdvancedSearch[] {
  try {
    const saved = storage.getItem(SAVED_ADVANCED_SEARCHES_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeSavedSearch)
      .filter((search): search is SavedAdvancedSearch => Boolean(search))
      .filter(search => search.name.length > 0 && search.query.length > 0)
      .slice(0, MAX_SAVED_ADVANCED_SEARCHES);
  } catch {
    return [];
  }
}

export function writeSavedAdvancedSearches(
  searches: SavedAdvancedSearch[],
  storage: Storage = localStorage
) {
  storage.setItem(
    SAVED_ADVANCED_SEARCHES_KEY,
    JSON.stringify(searches.slice(0, MAX_SAVED_ADVANCED_SEARCHES))
  );
}

export function addSavedAdvancedSearch(
  searches: SavedAdvancedSearch[],
  input: SavedAdvancedSearchInput
) {
  const normalized = normalizeSavedSearchInput(input);
  if (!normalized.name || !normalized.query) {
    return searches;
  }

  const next: SavedAdvancedSearch = {
    ...normalized,
    id: randomId(),
    createdAt: Date.now(),
  };

  return [next, ...searches].slice(0, MAX_SAVED_ADVANCED_SEARCHES);
}

export function renameSavedAdvancedSearch(
  searches: SavedAdvancedSearch[],
  id: string,
  name: string
) {
  const nextName = name.trim();
  if (!nextName) {
    return searches;
  }

  return searches.map(search => (search.id === id ? { ...search, name: nextName } : search));
}

export function deleteSavedAdvancedSearch(searches: SavedAdvancedSearch[], id: string) {
  return searches.filter(search => search.id !== id);
}
