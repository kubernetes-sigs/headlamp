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

import { useCallback, useMemo, useSyncExternalStore } from 'react';

type Listener = () => void;

interface StorageEntry {
  value: unknown;
  listeners: Set<Listener>;
  serializedDefaultValue: string;
}

// localStorage does not notify listeners in the same window, so hook instances
// using the same key share an in-memory entry.
const storageEntries = new Map<string, StorageEntry>();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return;

    if (event.key === null) {
      // localStorage.clear() was called. Reset all entries to their default values.
      for (const entry of storageEntries.values()) {
        entry.value = JSON.parse(entry.serializedDefaultValue);
        for (const listener of entry.listeners) {
          listener();
        }
      }
      return;
    }
    const entry = storageEntries.get(event.key);
    if (entry) {
      if (event.newValue === null) {
        // localStorage.removeItem() was called for this key.
        entry.value = JSON.parse(entry.serializedDefaultValue);
      } else {
        try {
          entry.value = JSON.parse(event.newValue);
        } catch (error) {
          // Ignore parse errors from other tabs
          return;
        }
      }
      for (const listener of entry.listeners) {
        listener();
      }
    }
  });
}

function readStoredValue<T>(key: string, serializedDefaultValue: string): T {
  let serializedValue: string | null;

  try {
    serializedValue = localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read ${key} from local storage, falling back to default value:`, error);
    return JSON.parse(serializedDefaultValue);
  }

  if (serializedValue === null) {
    return JSON.parse(serializedDefaultValue);
  }

  try {
    return JSON.parse(serializedValue);
  } catch (error) {
    console.warn(
      `Failed to parse ${key} from local storage, falling back to default value:`,
      error
    );
    return JSON.parse(serializedDefaultValue);
  }
}

function writeStoredValue(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error occurred while setting ${key} in local storage:`, error);
    return false;
  }
}

function getStorageEntry<T>(key: string, serializedDefaultValue: string): StorageEntry {
  const entry = storageEntries.get(key);
  if (entry) {
    return entry;
  }

  const newEntry: StorageEntry = {
    value: readStoredValue<T>(key, serializedDefaultValue),
    listeners: new Set(),
    serializedDefaultValue,
  };
  storageEntries.set(key, newEntry);

  return newEntry;
}

function subscribe(key: string, entry: StorageEntry, listener: Listener) {
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      storageEntries.delete(key);
    }
  };
}

function updateEntry<T>(key: string, entry: StorageEntry, updater: T | ((oldValue: T) => T)) {
  const isFunction = (val: any): val is (oldValue: T) => T => typeof val === 'function';
  const newValue = isFunction(updater) ? updater(entry.value as T) : updater;
  entry.value = newValue;

  for (const listener of entry.listeners) {
    listener();
  }

  writeStoredValue(key, newValue);
}

/**
 * Custom hook to manage state synchronized with localStorage and other hook instances
 * in the same window. Values must be serializable to JSON.
 *
 * It returns a reference to the same object for calls with the same key, so care
 * must be taken to not accidentally modify the returned object.
 *
 * @template T - The type of the state value.
 * @param key - The key under which the state is stored in localStorage.
 * @param defaultValue - The default value to use if no value is found in localStorage.
 * @returns The current state and a function that updates it.
 *
 * @example
 * const [value, setValue] = useLocalStorageState<string>('myKey', 'default');
 * setValue(() => 'newValue');
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  // Serializing also gives each new entry its own deep clone of the default value.
  const serializedDefaultValue = JSON.stringify(defaultValue);
  const entry = useMemo(
    () => getStorageEntry<T>(key, serializedDefaultValue),
    [key, serializedDefaultValue]
  );

  const subscribeToEntry = useCallback(
    (listener: Listener) => subscribe(key, entry, listener),
    [key, entry]
  );
  const getSnapshot = useCallback(() => entry.value as T, [entry]);
  const state = useSyncExternalStore(subscribeToEntry, getSnapshot, getSnapshot);
  const setState = useCallback(
    (updater: T | ((oldValue: T) => T)) => updateEntry(key, entry, updater),
    [entry, key]
  );

  return [state, setState] as const;
}
