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

import { ApiError } from './ApiError';

export const DISCOVERY_CONNECTION_CHANGED = 'Discovered cluster connection changed';

export function isDiscoveryConnectionChanged(error: unknown) {
  return (
    error instanceof Error &&
    (error as ApiError).status === 409 &&
    error.message.endsWith(DISCOVERY_CONNECTION_CHANGED)
  );
}

const resourceConnections = new WeakMap<object, { cluster: string; revision: string }>();

export function recordDiscoveryConnection(resource: object, cluster: string, revision?: string) {
  if (revision) resourceConnections.set(resource, { cluster, revision });
}

export function getResourceDiscoveryConnection(resource: object) {
  return resourceConnections.get(resource);
}

/** Attach the revision of the route that owns this request. */
export function withDiscoveryConnectionRevision<T extends object>(params: T, revision?: string) {
  const routingRevision = revision?.split(':', 1)[0];
  return routingRevision ? { ...params, __headlamp_connection_revision: routingRevision } : params;
}

export function getResourceConnectionQuery<T extends object>(
  resource: object,
  cluster: string,
  params: T
) {
  const connection = getResourceDiscoveryConnection(resource);
  if (connection && connection.cluster !== cluster) {
    throw new ApiError(DISCOVERY_CONNECTION_CHANGED, { status: 409 });
  }
  return withDiscoveryConnectionRevision(params, connection?.revision);
}
