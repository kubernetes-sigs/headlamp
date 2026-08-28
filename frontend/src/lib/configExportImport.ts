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

export function exportConfig(): void {
  const config: Record<string, string> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        config[key] = value;
      }
    }
  }

  const jsonString = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'headlamp-config.json';
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importConfig(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false; // Invalid format
    }

    // Basic schema validation: keys and values must be strings
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return false;
      }
    }

    const RUNTIME_IDENTIFIERS = ['headlamp-userId', 'auth_status', 'backstage_token'];

    // Clear managed configuration key set
    const currentKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) {
        currentKeys.push(key);
      }
    }

    for (const key of currentKeys) {
      if (!RUNTIME_IDENTIFIERS.includes(key)) {
        localStorage.removeItem(key);
      }
    }

    // Validated, apply to localStorage
    for (const [key, value] of Object.entries(parsed)) {
      localStorage.setItem(key, value as string);
    }

    return true;
  } catch (error) {
    console.error('Failed to parse config JSON', error);
    return false;
  }
}
