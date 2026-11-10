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

/** Result returned by native cluster registration. */
export interface ClusterRegistrationResult {
  /** Whether native registration updated the destination kubeconfig. */
  success: boolean;
  /** User-facing success or failure detail. */
  message: string;
}

/**
 * Native cluster-registration function injected into an authorized provider plugin.
 *
 * @param provider - Stable native provider ID.
 * @param options - Provider-defined options validated by the native provider.
 * @returns Native registration result.
 */
export type RegisterCluster = (
  provider: string,
  options: unknown
) => Promise<ClusterRegistrationResult>;

/**
 * Preload bridge that additionally requires Electron's private capability secret.
 *
 * @param provider - Stable native provider ID.
 * @param options - Provider-defined options validated by the native provider.
 * @param capabilitySecret - Opaque Electron-issued registration capability.
 * @returns Native registration result.
 */
export type DesktopRegisterCluster = (
  provider: string,
  options: unknown,
  capabilitySecret: string
) => Promise<ClusterRegistrationResult>;

/**
 * Builds lexical arguments for product-authorized provider plugin execution.
 *
 * @param allowedProviders - Provider IDs authorized for the current attested plugin.
 * @param desktopRegisterCluster - Private preload bridge captured before plugins execute.
 * @param capabilitySecret - Electron-generated bearer capability.
 * @returns Matching argument names and values, or empty arrays when authorization is unavailable.
 */
export function getClusterRegistrationArgValues(
  allowedProviders: readonly string[],
  desktopRegisterCluster: DesktopRegisterCluster | undefined,
  capabilitySecret: string | undefined
): [string[], unknown[]] {
  if (
    allowedProviders.length === 0 ||
    !desktopRegisterCluster ||
    typeof capabilitySecret !== 'string' ||
    !/^[0-9a-f]{64}$/.test(capabilitySecret)
  ) {
    return [[], []];
  }

  const registerCluster: RegisterCluster = (provider, options) => {
    if (!allowedProviders.includes(provider)) {
      return Promise.resolve({
        success: false,
        message: `Cluster registration provider '${provider}' is not authorized for this plugin.`,
      });
    }
    return desktopRegisterCluster(provider, options, capabilitySecret);
  };
  return [['registerCluster'], [registerCluster]];
}
