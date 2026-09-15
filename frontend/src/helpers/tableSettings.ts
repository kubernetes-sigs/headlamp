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

/**
 * Store the table column visibility settings in local storage.
 *
 * @param tableId - The ID of the table.
 * @param columns - The columns to store.
 */
export function storeTableSettings(tableId: string, columns: { id?: string; show: boolean }[]) {
  if (!tableId) {
    console.debug('storeTableSettings: tableId is empty!', new Error().stack);
    return;
  }

  const columnsWithIds = columns.map((c, i) => ({ id: i.toString(), ...c }));
  try {
    // Delete the entry if there are no settings to store.
    if (columnsWithIds.length === 0) {
      localStorage.removeItem(`table_settings.${tableId}`);
      return;
    }
    localStorage.setItem(`table_settings.${tableId}`, JSON.stringify(columnsWithIds));
  } catch (error) {
    console.error(
      `Error occurred while updating table_settings.${tableId} in local storage:`,
      error
    );
  }
}

/**
 * Load the table column visibility settings from local storage for a given table ID.
 *
 * @param tableId - The ID of the table.
 * @returns The table settings for the given table ID.
 */
export function loadTableSettings(tableId: string): { id: string; show: boolean }[] {
  if (!tableId) {
    console.debug('loadTableSettings: tableId is empty!', new Error().stack);
    return [];
  }

  try {
    const item = localStorage.getItem(`table_settings.${tableId}`);
    if (item === null) {
      return [];
    }
    const settings = JSON.parse(item);
    if (!Array.isArray(settings)) {
      console.warn(`table_settings.${tableId} is not an array, falling back to empty array.`);
      return [];
    }
    const validSettings = settings.filter(
      (entry): entry is { id: string; show: boolean } =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.show === 'boolean'
    );
    if (validSettings.length !== settings.length) {
      console.warn(`table_settings.${tableId} has invalid entries, falling back to empty array.`);
      return [];
    }
    return validSettings;
  } catch (error) {
    console.warn(
      `Failed to read table_settings.${tableId} from local storage, falling back to empty array:`,
      error
    );
    return [];
  }
}
