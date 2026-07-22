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
  /** Provider endpoint made available after readiness, when needed by the caller. */
  endpoint?: {
    /** Loopback host owned by Headlamp's proxy lifecycle. */
    host: '127.0.0.1';
    /** Allocated local port forwarded to the provider endpoint. */
    port: number;
  };
  /** Failure detail when startup did not succeed. */
  error?: string;
}

/** Proxy function injected into the authorized AKS Desktop plugin. */
export type StartClusterProxy = (target: ClusterProxyTarget) => Promise<StartClusterProxyResult>;

type DesktopStartClusterProxy = (
  target: ClusterProxyTarget,
  capabilitySecret: string
) => Promise<StartClusterProxyResult>;

/** Returns whether desktop-attested provenance permits the Azure proxy capability. */
export function isTrustedClusterProxyPlugin(
  isAksDesktop: boolean,
  source: 'development' | 'user' | 'shipped' | undefined,
  isDevelopmentMode: boolean
): boolean {
  return isAksDesktop && (source === 'shipped' || (source === 'development' && isDevelopmentMode));
}

/** Returns legacy command permissions only for a trusted AKS Desktop install. */
export function getAksDesktopCommandPermissions(
  isAksDesktop: boolean,
  source: 'development' | 'user' | 'shipped' | undefined,
  isDevelopmentMode: boolean,
  permissionSecrets: Record<string, number>
): Record<string, number> {
  if (!isTrustedClusterProxyPlugin(isAksDesktop, source, isDevelopmentMode)) {
    return {};
  }

  const permissionName = 'runCmd-scriptjs-azure-aks/azure-api.js';
  const permissionSecret = permissionSecrets[permissionName];
  return Number.isFinite(permissionSecret) ? { [permissionName]: permissionSecret } : {};
}

/**
 * Builds plugin arguments for the scoped Azure proxy capability.
 *
 * @param isAksDesktop - Whether package name and installation path identify AKS Desktop.
 * @param desktopStartClusterProxy - Private preload bridge captured before plugins run.
 * @param capabilitySecret - Desktop-generated bearer granted only to trusted AKS Desktop installs.
 * @returns Matching argument names and values, or empty arrays for unauthorized callers.
 */
export function getClusterProxyArgValues(
  isAksDesktop: boolean,
  desktopStartClusterProxy: DesktopStartClusterProxy | undefined,
  capabilitySecret: string | undefined
): [string[], unknown[]] {
  if (
    !isAksDesktop ||
    !desktopStartClusterProxy ||
    typeof capabilitySecret !== 'string' ||
    !/^[0-9a-f]{32}$/.test(capabilitySecret)
  ) {
    return [[], []];
  }

  const startClusterProxy: StartClusterProxy = target =>
    desktopStartClusterProxy(target, capabilitySecret);
  return [['startClusterProxy'], [startClusterProxy]];
}
