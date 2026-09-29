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

export const SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY = 'SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY';
export const SECRET_LIST_HELM_SECRET_HIDE_DEFAULT = true;

/**
 * Parses the stored hide-Helm-secrets preference. The value is only ever
 * written as 'true'/'false', so anything else (missing, corrupt, written by
 * something else) falls back to the default instead of crashing the render.
 */
export function parseStoredHideHelm(storedHideHelm: string | null): boolean {
  if (storedHideHelm === 'true' || storedHideHelm === 'false') {
    return storedHideHelm === 'true';
  }

  return SECRET_LIST_HELM_SECRET_HIDE_DEFAULT;
}

/**
 * Reads the hide-Helm-secrets preference from localStorage. Storage access
 * can itself throw when disabled/restricted, so guard it and fall back to
 * the default rather than crashing the render.
 */
export function loadHideHelm(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY);
  } catch (e) {
    console.warn(
      `Failed to read ${SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY} from localStorage, falling back to the default:`,
      e
    );
  }

  return parseStoredHideHelm(stored);
}

/** Stores the hide-Helm-secrets preference, ignoring storage failures. */
export function storeHideHelm(hideHelm: boolean): void {
  try {
    localStorage.setItem(SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY, hideHelm.toString());
  } catch (e) {
    console.warn(`Failed to set ${SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY} in localStorage:`, e);
  }
}
