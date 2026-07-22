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

/** Azure cluster details required to start a local proxy. */
export interface ClusterProxyTarget {
  /** Kubeconfig cluster name. */
  cluster: string;
  /** Azure subscription UUID containing the cluster. */
  subscriptionId: string;
  /** Azure resource group containing the cluster. */
  resourceGroup: string;
}

/** Result returned by the desktop proxy handler. */
export interface StartClusterProxyResult {
  /** Whether the proxy process started or was already running. */
  success: boolean;
  /** Failure detail when startup did not succeed. */
  error?: string;
}

/** Proxy function injected into the authorized Azure AKS plugin. */
export type StartClusterProxy = (target: ClusterProxyTarget) => Promise<StartClusterProxyResult>;

type DesktopStartClusterProxy = (
  target: ClusterProxyTarget,
  capabilitySecret: number
) => Promise<StartClusterProxyResult>;

/**
 * Builds plugin arguments for the scoped Azure proxy capability.
 *
 * @param isAzureAks - Whether both package name and installation path identify Azure AKS.
 * @param desktopStartClusterProxy - Private preload bridge captured before plugins run.
 * @param allowedPermissions - Secrets already filtered for the identified plugin.
 * @returns Matching argument names and values, or empty arrays for unauthorized callers.
 */
export function getClusterProxyArgValues(
  isAzureAks: boolean,
  desktopStartClusterProxy: DesktopStartClusterProxy | undefined,
  allowedPermissions: Record<string, number>
): [string[], unknown[]] {
  const capabilitySecret = allowedPermissions.startClusterProxy;
  if (!isAzureAks || !desktopStartClusterProxy || typeof capabilitySecret !== 'number') {
    return [[], []];
  }

  const startClusterProxy: StartClusterProxy = target =>
    desktopStartClusterProxy(target, capabilitySecret);
  return [['startClusterProxy'], [startClusterProxy]];
}
