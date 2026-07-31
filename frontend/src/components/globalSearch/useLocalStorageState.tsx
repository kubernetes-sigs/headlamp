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

import { SetStateAction, useCallback, useEffect, useState } from 'react';

/** Store listeners to allow updates outside of the hook */
const updateListeners: Record<string, Array<SetStateAction<any>>> = {};

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
  // This ensures that defaultValue, if the value (not the reference) does not change, is stable across render.
  // It also has the side effect of cloning the defaultValue to ensure it cannot be polluted.
  const serializedDefaultValue = JSON.stringify(defaultValue);

  const get = useCallback(() => {
    let maybeValue: string | null = null;

    try {
      maybeValue = localStorage.getItem(key);
    } catch (error) {
      console.warn(
        `Failed to read ${key} from local storage, falling back to default value:`,
        error
      );
      return JSON.parse(serializedDefaultValue);
    }

    if (maybeValue === null) {
      return JSON.parse(serializedDefaultValue);
    }

    try {
      return JSON.parse(maybeValue);
    } catch (error) {
      console.warn(
        `Failed to parse ${key} from local storage, falling back to default value:`,
        error
      );
      return JSON.parse(serializedDefaultValue);
    }
  }, [key, serializedDefaultValue]);
  const put = useCallback(
    (value: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error(`Error occurred while setting ${key} in local storage:`, error);
      }
    },
    [key]
  );

  const [state, setState] = useState<T>(() => get());

  const set = useCallback(
    (updater: (old: T) => T) => {
      const newValue = updater(state);
      put(newValue);
      setState(newValue);

      if (updateListeners[key].length > 1) {
        for (const updateListener of updateListeners[key]) {
          updateListener(() => newValue);
        }
      }
    },
    [state, put, key]
  );

  // Listen to any updates to local storage
  useEffect(() => {
    updateListeners[key] ??= [];
    updateListeners[key].push(setState);

    return () => {
      updateListeners[key] = updateListeners[key].filter(it => it !== setState);
    };
  }, [key, set]);

  return [state, set] as const;
}
