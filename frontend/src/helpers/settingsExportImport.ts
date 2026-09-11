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

export interface ExportedSettings {
  version: number;
  data: Record<string, string>;
}

const EXPORT_VERSION = 1;

const EXACT_KEYS_TO_EXPORT = [
  'settings',
  'keyboardShortcuts',
  'filter',
  'sidebar',
  'recent_clusters',
  'tables_rows_per_page',
  'detailDrawerEnabled',
  'headlampThemePreference',
  'cached-current-theme',
];

const PREFIXES_TO_EXPORT = ['cluster_settings.', 'table_settings.', 'headlamp-selected-namespace_'];

/**
 * Determines whether a localStorage key should be included in the export.
 */
export function shouldExportKey(key: string): boolean {
  if (EXACT_KEYS_TO_EXPORT.includes(key)) {
    return true;
  }
  for (const prefix of PREFIXES_TO_EXPORT) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Exports all relevant configuration settings from localStorage into a JSON object.
 */
export function getExportSettings(): ExportedSettings {
  const data: Record<string, string> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && shouldExportKey(key)) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    }
  }

  return {
    version: EXPORT_VERSION,
    data,
  };
}

/**
 * Triggers a download of the current settings configuration as a JSON file.
 */
export function exportConfigurationToFile() {
  const settings = getExportSettings();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `headlamp-config-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates the structure of an imported settings payload.
 * Rejects null, arrays, wrong version, and non-string data values.
 */
function isValidSettingsPayload(
  settings: ExportedSettings
): settings is ExportedSettings & { data: Record<string, string> } {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return false;
  }
  if (settings.version !== EXPORT_VERSION) {
    return false;
  }
  if (!settings.data || typeof settings.data !== 'object' || Array.isArray(settings.data)) {
    return false;
  }
  // Verify all values are strings and valid JSON where applicable
  for (const [key, value] of Object.entries(settings.data)) {
    if (typeof value !== 'string') {
      return false;
    }
    // Only validate keys we will actually import
    if (!shouldExportKey(key)) {
      continue;
    }
    // If it looks like a JSON object or array, ensure it is actually valid JSON
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))
    ) {
      try {
        JSON.parse(value);
      } catch (e) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Imports configuration settings from a JSON object and saves them to localStorage.
 * This replaces all existing allowlisted keys: keys present in the current storage
 * but absent from the import will be removed so the import faithfully restores
 * the source state.
 */
export function importSettings(settings: ExportedSettings): boolean {
  if (!isValidSettingsPayload(settings)) {
    return false;
  }

  // Snapshot existing allowlisted keys to enable rollback on failure
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && shouldExportKey(key)) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        snapshot[key] = val;
      }
    }
  }

  // Identify new keys that are written during import so we can clean them up on failure
  const writtenKeys: string[] = [];

  try {
    // Remove existing allowlisted keys so the import replaces rather than merges.
    for (const key of Object.keys(snapshot)) {
      localStorage.removeItem(key);
    }

    for (const [key, value] of Object.entries(settings.data)) {
      if (shouldExportKey(key)) {
        localStorage.setItem(key, value);
        writtenKeys.push(key);
      }
    }
    return true;
  } catch (error) {
    // Rollback: delete any keys written during the failed import
    for (const key of writtenKeys) {
      localStorage.removeItem(key);
    }
    // Restore the snapshotted keys
    for (const [key, value] of Object.entries(snapshot)) {
      try {
        localStorage.setItem(key, value);
      } catch (rollbackError) {
        console.error('Failed to rollback settings during import error:', rollbackError);
      }
    }
    throw error;
  }
}
