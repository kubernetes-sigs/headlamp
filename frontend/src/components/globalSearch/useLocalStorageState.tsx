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

import { useCallback, useEffect, useRef, useState } from 'react';

/** Store listeners to allow updates outside of the hook */
const updateListeners: Record<string, Array<(newValue: any) => void>> = {};

/**
 * Custom hook to manage state synchronized with localStorage.
 * Value must by serializable to JSON.
 *
 * @template T - The type of the state value.
 * @param {string} key - The key under which the state is stored in localStorage.
 * @param {T} defaultValue - The default value to use if no value is found in localStorage.
 * @returns Returns a tuple containing the current state and a function to update the state.
 *
 * @example
 * const [value, setValue] = useLocalStorageState<string>('myKey', 'default');
 * setValue((oldValue) => 'newValue');
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const get = () => {
    let maybeValue: string | null = null;

    try {
      maybeValue = localStorage.getItem(key);
    } catch (e) {
      console.warn(`Failed to read "${key}" from localStorage, falling back to default value:`, e);
      return defaultValue;
    }

    if (maybeValue === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(maybeValue);
    } catch (e) {
      console.warn(`Failed to parse "${key}" from localStorage, falling back to default value:`, e);
      return defaultValue;
    }
  };

  const [state, setState] = useState<T>(() => get());

  // Keep a ref of the latest known state (used to avoid stale closures across batched updates).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Update state and persist the new value to localStorage.
  // - Computes from a mutable ref (stateRef) that is updated on every call, so consecutive
  //   synchronous calls accumulate correctly even within a single batched render.
  // - Writes to localStorage outside the caller-provided `updater` function (so the updater can stay pure).
  // - Deps: [key]
  const set = useCallback(
    (updater: (old: T) => T) => {
      const newValue = updater(stateRef.current);
      stateRef.current = newValue;
      try {
        localStorage.setItem(key, JSON.stringify(newValue));
      } catch (e) {
        console.error(`Failed to save "${key}" to localStorage`, e);
      }
      setState(newValue);
    },
    [key]
  );

  // Subscribe to cross-component updates triggered via useLocalStorageState.update().
  // - Updates stateRef and setState directly (instead of calling set()) because
  //   update() already persisted the value to localStorage. Calling set() would
  //   cause 1 + N redundant localStorage.setItem() calls for N subscribers.
  useEffect(() => {
    const listener = (newValue: any) => {
      stateRef.current = newValue;
      setState(newValue);
    };

    updateListeners[key] ??= [];
    updateListeners[key].push(listener);

    return () => {
      const listeners = updateListeners[key]?.filter(it => it !== listener) ?? [];
      if (listeners.length === 0) {
        delete updateListeners[key];
      } else {
        updateListeners[key] = listeners;
      }
    };
  }, [key]);

  return [state, set] as const;
}

/**
 * Update the value in local storage and notify all `useLocalStorageState` hooks.
 *
 * @param key - local storage key
 * @param value - local storage value
 */
useLocalStorageState.update = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save "${key}" to localStorage`, e);
  }
  updateListeners[key]?.forEach(fn => fn(value));
};
