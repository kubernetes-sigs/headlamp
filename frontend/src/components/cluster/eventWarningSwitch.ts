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

export const EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY = 'EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY';
export const EVENT_WARNING_SWITCH_DEFAULT = true;

/**
 * Parses the stored "only warnings" event filter preference. The value is only
 * ever written as 'true'/'false', so anything else (missing, corrupt, written
 * by something else) falls back to the default instead of crashing the render.
 */
export function parseStoredEventWarningSwitch(storedValue: string | null): boolean {
  if (storedValue === 'true' || storedValue === 'false') {
    return storedValue === 'true';
  }

  return EVENT_WARNING_SWITCH_DEFAULT;
}

/**
 * Reads the "only warnings" event filter preference from localStorage. Storage
 * access can itself throw when disabled/restricted, so guard it and fall back
 * to the default rather than crashing the render.
 */
export function loadEventWarningSwitch(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY);
  } catch (e) {
    console.warn(
      `Failed to read ${EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY} from localStorage, falling back to the default:`,
      e
    );
  }

  return parseStoredEventWarningSwitch(stored);
}

/** Stores the "only warnings" event filter preference, ignoring storage failures. */
export function storeEventWarningSwitch(checked: boolean): void {
  try {
    localStorage.setItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY, checked.toString());
  } catch (e) {
    console.warn(`Failed to set ${EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY} in localStorage:`, e);
  }
}
