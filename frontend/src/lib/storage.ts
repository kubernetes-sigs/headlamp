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

import { getCluster } from './cluster';

const NAMESPACE_STORAGE_KEY = 'headlamp-selected-namespace';

export function getSavedNamespaces(cluster?: string): string[] {
  const activeCluster = cluster || getCluster();
  if (!activeCluster) {
    return [];
  }
  try {
    const saved = localStorage.getItem(`${NAMESPACE_STORAGE_KEY}_${activeCluster}`);
    const namespaces = JSON.parse(saved!);
    if (Array.isArray(namespaces)) {
      const filtered = Array.from(
        new Set(namespaces.filter((ns): ns is string => typeof ns === 'string' && ns.trim() !== ''))
      );
      return filtered;
    }
    return [];
  } catch (e) {
    console.error('Failed to load namespace from storage', e);
    return [];
  }
}

export function saveNamespaces(namespaces: string[], cluster?: string) {
  const activeCluster = cluster || getCluster();
  if (!activeCluster) {
    return;
  }
  try {
    const filtered = Array.from(
      new Set(namespaces.filter((ns): ns is string => typeof ns === 'string' && ns.trim() !== ''))
    );
    localStorage.setItem(`${NAMESPACE_STORAGE_KEY}_${activeCluster}`, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to save namespaces in Local Storage:', e);
  }
}
