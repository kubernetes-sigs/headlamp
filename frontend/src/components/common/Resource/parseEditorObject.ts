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

import * as yaml from 'js-yaml';

/** Parse a YAML string into a plain object. Returns `null` for non-empty
 *  invalid input so the form state is not overwritten mid-edit. Blank input
 *  yields `{}`. Used to sync form states when the user edits YAML directly
 *  in the editor panel. */
export function parseEditorObject(input: string): Record<string, any> | null {
  if (!input.trim()) return {};

  try {
    const parsed = yaml.load(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    // Ignore parse errors while editing incomplete YAML.
  }

  return null;
}
