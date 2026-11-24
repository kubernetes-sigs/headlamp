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

import type { GatewayBackendReference, GatewayParentReference } from './gateway';

export const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';

export type ResolvedGatewayParentReference = GatewayParentReference & {
  group: string;
  kind: string;
  namespace?: string;
};

export type ResolvedGatewayBackendReference = GatewayBackendReference & {
  group: string;
  kind: string;
  namespace?: string;
};

export const resolveGatewayParentReference = (
  ref: GatewayParentReference,
  routeNamespace?: string
): ResolvedGatewayParentReference => ({
  ...ref,
  group: ref.group ?? GATEWAY_API_GROUP,
  kind: ref.kind ?? 'Gateway',
  namespace: ref.namespace ?? routeNamespace,
});

export const resolveGatewayBackendReference = (
  ref: GatewayBackendReference,
  routeNamespace?: string
): ResolvedGatewayBackendReference => ({
  ...ref,
  group: ref.group ?? '',
  kind: ref.kind ?? 'Service',
  namespace: ref.namespace ?? routeNamespace,
});
