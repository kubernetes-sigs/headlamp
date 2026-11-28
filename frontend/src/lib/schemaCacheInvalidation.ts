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

// Keep lifecycle notifications independent of auth, Redux and schema transport
// imports so invalidation cannot introduce initialization cycles.
const listeners = new Set<(cluster?: string) => void>();
export function onSchemaCacheInvalidation(listener: (cluster?: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function invalidateSchemaCache(cluster?: string) {
  listeners.forEach(listener => listener(cluster));
}
export function invalidateChangedConnections(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown> | null
) {
  for (const name of new Set([...Object.keys(previous ?? {}), ...Object.keys(current ?? {})])) {
    if (JSON.stringify(previous?.[name]) !== JSON.stringify(current?.[name])) {
      invalidateSchemaCache(name);
    }
  }
}
