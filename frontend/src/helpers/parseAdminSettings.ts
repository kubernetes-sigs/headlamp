/*
 * Copyright 2026 The Kubernetes Authors
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

import type { AdminSettingsState, DisplayMode, SettingsSource } from '../redux/adminSettingsSlice';

const DEFAULT_SOURCE_TYPE = 'configmap';
const DEFAULT_NAMESPACE = 'headlamp-tools';
const DEFAULT_SOURCE_NAME = 'headlamp-settings';

interface RawSettings {
  clusterDefinedSettings?: any;
  defaults?: Record<string, any>;
}

interface ParseResult {
  defaults: Record<string, any>;
  display: Record<string, DisplayMode>;
  clusterDefinedSettings: any;
  clusterDefined: Record<string, string[]>;
  sources: Record<string, SettingsSource[]>;
}

/**
 * Parses raw admin settings JSON from the backend into the processed shape
 * expected by the Redux store. Handles unwrapping $value/$display/$clusterDefined
 * wrappers and resolving clusterDefinedSettings into sources.
 */
export function parseAdminSettings(raw: RawSettings): ParseResult {
  const display: Record<string, DisplayMode> = {};
  const clusterDefined: Record<string, string[]> = {};

  const defaults = raw.defaults ? structuredClone(raw.defaults) : {};
  unwrapTree(defaults, '', display, clusterDefined);

  const sources = resolveClusterSources(raw.clusterDefinedSettings);

  return {
    defaults,
    display,
    clusterDefinedSettings: raw.clusterDefinedSettings ?? {},
    clusterDefined,
    sources,
  };
}

/**
 * Checks if a value is a wrapped settings object (has $value key).
 */
function isWrapped(val: unknown): val is Record<string, any> & { $value: any } {
  return typeof val === 'object' && val !== null && '$value' in val;
}

/**
 * Recursively walks the defaults tree, extracts $value/$display/$clusterDefined
 * wrappers, and replaces wrapped objects with their plain $value in-place.
 */
function unwrapTree(
  obj: Record<string, any>,
  prefix: string,
  display: Record<string, DisplayMode>,
  clusterDefined: Record<string, string[]>
) {
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      continue;
    }

    if (!isWrapped(val)) {
      unwrapTree(val, path, display, clusterDefined);
      continue;
    }

    extractDisplay(val, path, display);
    extractClusterDefined(val, path, clusterDefined);

    obj[key] = val.$value;

    if (typeof val.$value === 'object' && val.$value !== null && !Array.isArray(val.$value)) {
      unwrapTree(val.$value, path, display, clusterDefined);
    }
  }
}

function extractDisplay(
  obj: Record<string, any>,
  path: string,
  display: Record<string, DisplayMode>
) {
  const d = obj.$display;
  if (d === 'disabled' || d === 'hidden') {
    display[path] = d;
  }
}

function extractClusterDefined(
  obj: Record<string, any>,
  path: string,
  clusterDefined: Record<string, string[]>
) {
  const cd = obj.$clusterDefined;
  if (Array.isArray(cd)) {
    clusterDefined[path] = cd.filter((c): c is string => typeof c === 'string');
  }
}

/**
 * Resolves clusterDefinedSettings into a sources map.
 * Handles both short form (string[]) and long form (Record<string, source[]>).
 */
function resolveClusterSources(clusterDefinedSettings: any): Record<string, SettingsSource[]> {
  if (!clusterDefinedSettings) {
    return {};
  }

  // Short form: ["*"] or ["prod", "dev"]
  if (Array.isArray(clusterDefinedSettings)) {
    if (clusterDefinedSettings.length === 0) {
      return {};
    }

    const sources: Record<string, SettingsSource[]> = {};
    for (const name of clusterDefinedSettings) {
      if (typeof name === 'string') {
        sources[name] = [
          { name: DEFAULT_SOURCE_NAME, type: DEFAULT_SOURCE_TYPE, namespace: DEFAULT_NAMESPACE },
        ];
      }
    }
    return sources;
  }

  // Long form: { "*": [...], "prod": [...] }
  if (typeof clusterDefinedSettings === 'object') {
    const sources: Record<string, SettingsSource[]> = {};
    for (const [cluster, rawSources] of Object.entries(clusterDefinedSettings)) {
      if (!Array.isArray(rawSources)) {
        continue;
      }

      const validSources = (rawSources as any[])
        .filter(
          s =>
            typeof s === 'object' && s !== null && typeof s.name === 'string' && s.name.length > 0
        )
        .map(s => ({
          name: s.name as string,
          type: typeof s.type === 'string' ? s.type : DEFAULT_SOURCE_TYPE,
          namespace: typeof s.namespace === 'string' ? s.namespace : DEFAULT_NAMESPACE,
        }));
      if (validSources.length === 0) {
        continue;
      }
      sources[cluster] = validSources;
    }
    return sources;
  }

  return {};
}

/**
 * Applies parsed admin settings to an AdminSettingsState, preserving runtime fields.
 */
export function applyAdminSettings(
  parsed: ParseResult,
  existing?: Partial<AdminSettingsState>
): AdminSettingsState {
  return {
    defaults: parsed.defaults,
    display: parsed.display,
    clusterDefinedSettings: parsed.clusterDefinedSettings,
    clusterDefined: parsed.clusterDefined,
    sources: parsed.sources,
    clusterSettings: existing?.clusterSettings ?? {},
  };
}
