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

import type { KubeObjectClass } from '../../KubeObject';
import type { QueryParameters } from '../v1/queryParameters';
import type { KubeObjectEndpoint } from './KubeObjectEndpoint';

/**
 * Feature flag for the websocket multiplexer. Reads
 * `REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER`; only the literal string `'true'`
 * enables it, so the multiplexer is opt-in and defaults to disabled when the
 * env var is unset or any other value.
 */
export function getWebsocketMultiplexerEnabled(): boolean {
  return import.meta.env.REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER === 'true';
}

/**
 * Stable cache-key discriminator per KubeObject class so two classes hitting
 * the same API endpoint (e.g. plugin MyPod vs built-in Pod) get separate
 * react-query cache entries (#4780). The class→id map is stored on `globalThis`
 * under a `Symbol.for(...)` key so the plugin SDK's bundled copy of
 * `frontend/src/lib/**` shares the same lookup as the app; a WeakMap is keyed
 * by the class constructor reference (so subclasses don't inherit the parent's
 * id and unused classes can be GC'd); a manual `randomUUID` fallback covers
 * environments where `crypto.randomUUID` isn't present.
 */
const REGISTRY_KEY = Symbol.for('headlamp.kubeObjectClassCacheKey');

function getClassIdRegistry(): WeakMap<KubeObjectClass, string> {
  const slot = globalThis as unknown as { [key: symbol]: unknown };
  let registry = slot[REGISTRY_KEY] as WeakMap<KubeObjectClass, string> | undefined;
  if (!registry) {
    registry = new WeakMap<KubeObjectClass, string>();
    slot[REGISTRY_KEY] = registry;
  }
  return registry;
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback for environments without `crypto.randomUUID`. Not cryptographically
  // secure, but we only need per-class uniqueness within a session.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getKubeObjectClassCacheKey(cls: KubeObjectClass): string {
  const registry = getClassIdRegistry();
  let id = registry.get(cls);
  if (id === undefined) {
    id = `cls-${randomId()}-${cls.name || 'anon'}`;
    registry.set(cls, id);
  }
  return id;
}

/**
 * Builds the react-query cache key for a single KubeObject GET.
 */
export const kubeObjectQueryKey = ({
  cluster,
  endpoint,
  namespace,
  name,
  queryParams,
  kubeObjectClassCacheKey,
}: {
  cluster: string;
  endpoint?: KubeObjectEndpoint | null;
  namespace?: string;
  name: string;
  queryParams?: QueryParameters;
  /**
   * Stable per-class cache discriminator from `getKubeObjectClassCacheKey`.
   * Used to separate cache entries between two classes targeting the same
   * API endpoint (e.g. a plugin's MyPod and the built-in Pod), so `_class()`
   * resolves correctly on each (#4780).
   */
  kubeObjectClassCacheKey?: string;
}) => [
  'object',
  cluster,
  endpoint,
  namespace ?? '',
  name,
  kubeObjectClassCacheKey ?? '',
  queryParams ?? {},
];
