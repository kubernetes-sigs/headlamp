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

const VALID_PROVIDER = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_PROVIDER_LENGTH = 214;
const MAX_PROVIDERS = 16;

/** Opaque authorization for one host-registered cluster provider. */
export interface ClusterProviderCapability {
  /** Stable ID of the authorized provider. */
  provider: string;
  /** Opaque token that authorizes provider invocation. */
  capability: string;
}

/**
 * Reads valid cluster provider declarations from package metadata.
 *
 * @param packageInfo - Untrusted package metadata.
 * @returns Unique valid provider IDs declared by the package.
 */
export function getDeclaredClusterProviders(packageInfo: unknown): string[] {
  if (typeof packageInfo !== 'object' || packageInfo === null) {
    return [];
  }
  const headlamp = (packageInfo as { headlamp?: unknown }).headlamp;
  if (typeof headlamp !== 'object' || headlamp === null) {
    return [];
  }
  const providers = (headlamp as { clusterProviders?: unknown }).clusterProviders;
  if (!Array.isArray(providers) || providers.length > MAX_PROVIDERS) {
    return [];
  }
  return [
    ...new Set(
      providers.filter(
        provider =>
          typeof provider === 'string' &&
          provider.length <= MAX_PROVIDER_LENGTH &&
          VALID_PROVIDER.test(provider)
      )
    ),
  ];
}

/**
 * Finds the opaque capability for a declared provider.
 *
 * @param capabilities - Capabilities authorized for one package plugin.
 * @param provider - Stable provider ID requested by the plugin.
 * @returns The capability token, or undefined when the provider is unauthorized.
 */
export function findClusterProviderCapability(
  capabilities: ClusterProviderCapability[],
  provider: string
): string | undefined {
  return capabilities.find(item => item.provider === provider)?.capability;
}
