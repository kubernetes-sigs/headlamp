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

import store from '../redux/stores/store';
import type { AdminSettingsState, SettingSource } from '../settings/adminSettingsSlice';
import {
  getDisplayMode,
  getNestedValue,
  resolveSettingValue,
  stripClusterPrefix,
} from '../settings/settingsResolution';

/**
 * ClusterSettings defines the structure of the cluster settings object.
 */
export interface ClusterSettings {
  /** Optional default namespace to be used */
  defaultNamespace?: string;
  /** Only allow namespaces in this list to be selected */
  allowedNamespaces?: string[];
  /**
   * A Kubernetes label selector (e.g. "team=frontend,env=prod") used to dynamically
   * resolve the list of allowed namespaces from the cluster.
   */
  allowedNamespacesSelector?: string;
  /** This is a custom cluster name. If it is '' it is the actual cluster name. */
  currentName?: string;
  nodeShellTerminal?: {
    linuxImage?: string;
    namespace?: string;
    isEnabled?: boolean;
  };
  podDebugTerminal?: {
    debugImage?: string;
    isEnabled?: boolean;
  };
  /** Cluster appearance settings stored in localStorage */
  appearance?: {
    accentColor?: string;
    icon?: string;
  };
  /**
   * Headlamp tags used to filter and group clusters on the Home page.
   * Keys and values follow key/value syntax (e.g. "environment": "production").
   */
  tags?: Record<string, string>;
}

export const DEFAULT_NODE_SHELL_LINUX_IMAGE = 'docker.io/library/busybox:latest';
export const DEFAULT_NODE_SHELL_NAMESPACE = 'default';
export const DEFAULT_POD_DEBUG_IMAGE = 'docker.io/library/busybox:latest';

const clusterSettingsListeners = new Set<() => void>();

function notifyClusterSettingsListeners() {
  for (const listener of clusterSettingsListeners) {
    listener();
  }
}

/** Subscribes to settings and namespace-cache changes in this window and other tabs. */
export function subscribeToClusterSettings(listener: () => void): () => void {
  clusterSettingsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea === localStorage &&
      (event.key === null ||
        event.key.startsWith('cluster_settings.') ||
        event.key.startsWith('cluster_allowed_namespaces_selector_cache.'))
    ) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    clusterSettingsListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Stores the cluster settings in local storage and notifies subscribers.
 *
 * @param clusterName - The name of the cluster.
 * @param settings - The cluster settings to be stored.
 * @returns {void}
 */
export function storeClusterSettings(clusterName: string, settings: ClusterSettings) {
  if (!clusterName) {
    return;
  }
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
  notifyClusterSettingsListeners();
}

/**
 * Loads the cluster settings from local storage.
 *
 * @param clusterName - The name of the cluster.
 * @returns {ClusterSettings} - The cluster settings.
 */
export function loadClusterSettings(clusterName: string): ClusterSettings {
  if (!clusterName) {
    return {};
  }
  try {
    const raw = localStorage.getItem(`cluster_settings.${clusterName}`) || '{}';
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`cluster_settings.${clusterName} is not an object, falling back to {}.`);
      return {};
    }
    return parsed as ClusterSettings;
  } catch (error) {
    console.warn(`Failed to parse cluster_settings.${clusterName}, falling back to {}:`, error);
  }
  return {};
}

/**
 * Namespaces resolved from a cluster's allowedNamespacesSelector, cached in
 * localStorage. This is derived data (the source of truth is the API server), so
 * it lives under its own key instead of inside the user's cluster settings blob
 * and carries the selector it was resolved for plus a timestamp to signal staleness.
 */
export interface ResolvedAllowedNamespacesCache {
  /** The label selector this list was resolved from. */
  selector: string;
  /**
   * The resolved namespace names. An empty list is a known empty result or a
   * fail-closed query failure; a missing cache is unresolved and may be reconciled.
   * Replacing an empty list requires query data newer than resolvedAt.
   */
  namespaces: string[];
  /** Epoch milliseconds of when the list was last resolved. */
  resolvedAt: number;
}

/**
 * How long a resolved-namespaces cache entry is considered fresh. Past this age
 * it is treated as stale and refreshed the next time the selector is resolved.
 */
export const ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function resolvedAllowedNamespacesKey(clusterName: string): string {
  return `cluster_allowed_namespaces_selector_cache.${clusterName}`;
}

/**
 * Loads the cached namespaces resolved from a cluster's label selector.
 *
 * @param clusterName - The name of the cluster.
 * @returns The cache entry, or null if none is stored or it is malformed.
 */
export function loadResolvedAllowedNamespaces(
  clusterName: string
): ResolvedAllowedNamespacesCache | null {
  if (!clusterName) {
    return null;
  }
  const raw = localStorage.getItem(resolvedAllowedNamespacesKey(clusterName));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as ResolvedAllowedNamespacesCache).selector !== 'string' ||
      !Array.isArray((parsed as ResolvedAllowedNamespacesCache).namespaces) ||
      typeof (parsed as ResolvedAllowedNamespacesCache).resolvedAt !== 'number'
    ) {
      return null;
    }
    return parsed as ResolvedAllowedNamespacesCache;
  } catch {
    return null;
  }
}

/**
 * Stores the namespaces resolved from a cluster's label selector, stamped with
 * the selector they were resolved for and the current time, and notifies subscribers.
 *
 * @param clusterName - The name of the cluster.
 * @param selector - The label selector the namespaces were resolved from.
 * @param namespaces - The resolved namespace names.
 */
export function storeResolvedAllowedNamespaces(
  clusterName: string,
  selector: string,
  namespaces: string[]
) {
  if (!clusterName) {
    return;
  }
  const entry: ResolvedAllowedNamespacesCache = {
    selector,
    namespaces: [...new Set(namespaces)].sort(),
    resolvedAt: Date.now(),
  };
  localStorage.setItem(resolvedAllowedNamespacesKey(clusterName), JSON.stringify(entry));
  notifyClusterSettingsListeners();
}

/**
 * Removes cached namespaces resolved from a cluster's selector and notifies subscribers.
 *
 * @param clusterName - The name of the cluster.
 */
export function clearResolvedAllowedNamespaces(clusterName: string) {
  if (!clusterName) {
    return;
  }
  localStorage.removeItem(resolvedAllowedNamespacesKey(clusterName));
  notifyClusterSettingsListeners();
}

/**
 * Resolves a cluster-scoped setting through the admin settings hierarchy,
 * taking the user's localStorage value as the user-level value.
 *
 * Hierarchy:
 * - normal mode: user localStorage > cluster-defined > admin default > built-in
 * - hidden / disabled: cluster-defined > admin default > built-in (user ignored)
 */
export function resolveClusterSetting<T = any>(
  path: string,
  clusterName: string,
  adminSettings?: AdminSettingsState | null | unknown
): { value: T | undefined; hidden: boolean; disabled: boolean; source: SettingSource } {
  const admin =
    adminSettings && typeof adminSettings === 'object' && 'defaults' in adminSettings
      ? (adminSettings as AdminSettingsState)
      : adminSettings === null
      ? null
      : store?.getState?.()?.adminSettings ?? null;
  const clusterSettings = loadClusterSettings(clusterName);
  const clusterPath = stripClusterPrefix(path, clusterName);
  const rawUserValue = getNestedValue(clusterSettings, clusterPath);
  const userValue =
    rawUserValue === '' || (Array.isArray(rawUserValue) && rawUserValue.length === 0)
      ? undefined
      : (rawUserValue as T | undefined);

  const { value, source } = resolveSettingValue<T | undefined>(
    path,
    userValue,
    undefined,
    admin,
    clusterName
  );
  const mode = getDisplayMode(admin, path, clusterName);

  return {
    value,
    hidden: mode === 'hidden',
    disabled: mode === 'disabled',
    source,
  };
}

/**
 * Returns whether the resolved-namespaces cache for a cluster needs to be
 * refreshed: there is a selector configured but no cache, the cache was resolved
 * for a different selector, or the cache is older than the max age.
 *
 * @param clusterName - The name of the cluster.
 * @param now - The current time in epoch milliseconds (defaults to Date.now()).
 * @param adminSettings - Optional admin settings state to resolve against.
 * @returns true if the cache is missing, mismatched or too old.
 */
export function isResolvedAllowedNamespacesStale(
  clusterName: string,
  now: number = Date.now(),
  adminSettings?: AdminSettingsState | null | unknown
): boolean {
  const selector = (
    resolveClusterSetting<string>(
      'clusters.*.allowedNamespacesSelector',
      clusterName,
      adminSettings
    ).value || ''
  ).trim();
  if (!selector) {
    return false;
  }
  const cache = loadResolvedAllowedNamespaces(clusterName);
  if (!cache || cache.selector !== selector) {
    return true;
  }
  return now - cache.resolvedAt > ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS;
}

/**
 * Namespaces the backend reported as accessible for users who cannot list
 * namespaces (see lib/k8s/accessibleNamespaces.ts). Kept in memory only: it is
 * derived from the current user's permissions and must not outlive the session.
 * A missing entry means no discovered restriction applies.
 */
const discoveredNamespaces = new Map<string, string[]>();

/**
 * Bumped whenever the identity may have changed (login, logout, token change).
 * It is part of the discovery query key, so a response for an older identity
 * can never be written back after a reset.
 */
let discoveryGeneration = 0;

/** Bumped on every change, for useSyncExternalStore subscribers. */
let discoveredNamespacesVersion = 0;

const discoveredNamespacesListeners = new Set<() => void>();

function notifyDiscoveredNamespacesChanged() {
  discoveredNamespacesVersion++;
  discoveredNamespacesListeners.forEach(listener => listener());
}

/**
 * Subscribes to changes of the discovered namespaces (useSyncExternalStore).
 *
 * @param listener - Called after every change.
 * @returns A function that removes the listener.
 */
export function subscribeDiscoveredNamespaces(listener: () => void): () => void {
  discoveredNamespacesListeners.add(listener);
  return () => discoveredNamespacesListeners.delete(listener);
}

/**
 * Returns a number that changes whenever the discovered namespaces change.
 */
export function getDiscoveredNamespacesVersion(): number {
  return discoveredNamespacesVersion;
}

/**
 * Returns the current discovery generation (see resetDiscoveredNamespaces).
 */
export function getDiscoveryGeneration(): number {
  return discoveryGeneration;
}

function sameNamespaceList(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Stores or clears the namespaces discovered for a cluster.
 *
 * @param clusterName - The name of the cluster.
 * @param namespaces - The accessible namespaces, or null to drop the restriction.
 */
export function setDiscoveredNamespaces(clusterName: string, namespaces: string[] | null) {
  if (!clusterName) {
    return;
  }
  const next = namespaces === null ? undefined : [...new Set(namespaces)].sort();
  if (sameNamespaceList(discoveredNamespaces.get(clusterName), next)) {
    return;
  }
  if (next === undefined) {
    discoveredNamespaces.delete(clusterName);
  } else {
    discoveredNamespaces.set(clusterName, next);
  }
  notifyDiscoveredNamespacesChanged();
}

/**
 * Drops discovered namespaces after the identity may have changed and starts a
 * new discovery generation, so in-flight results for the old identity are ignored.
 *
 * @param clusterName - The cluster to reset, or undefined for all clusters (e.g.
 *                      after an OIDC login whose token may be broadcast to siblings).
 */
export function resetDiscoveredNamespaces(clusterName?: string) {
  if (clusterName) {
    discoveredNamespaces.delete(clusterName);
  } else {
    discoveredNamespaces.clear();
  }
  discoveryGeneration++;
  notifyDiscoveredNamespacesChanged();
}

/**
 * Returns the namespaces discovered for a cluster, or undefined when discovery
 * does not restrict this cluster.
 *
 * @param clusterName - The name of the cluster.
 */
export function getDiscoveredNamespaces(clusterName: string): string[] | undefined {
  return discoveredNamespaces.get(clusterName);
}

/**
 * Resolves explicit allowedNamespaces and allowedNamespacesSelector for a cluster.
 */
function getResolvedNamespaceConfig(
  cluster: string,
  adminSettings?: AdminSettingsState | null | unknown
): { allowedNamespaces: string[]; selector: string } {
  const admin =
    adminSettings && typeof adminSettings === 'object' && 'defaults' in adminSettings
      ? (adminSettings as AdminSettingsState)
      : undefined;
  const allowedNamespaces =
    resolveClusterSetting<string[]>('clusters.*.allowedNamespaces', cluster, admin).value || [];
  const selector = (
    resolveClusterSetting<string>('clusters.*.allowedNamespacesSelector', cluster, admin).value ||
    ''
  ).trim();
  return { allowedNamespaces, selector };
}

/**
 * Returns the combined list of allowed namespaces for a cluster: the manually
 * configured ones plus the ones resolved from the namespace label selector (if
 * any). The result is sorted and does not contain duplicates.
 *
 * The resolved list is only included when it was resolved for the currently
 * configured selector, so a stale list left over from a previous selector is
 * never used.
 *
 * When nothing is configured, the namespaces discovered for users who cannot
 * list namespaces are returned instead.
 *
 * @param cluster - The name of the cluster.
 * @param adminSettings - Optional admin settings state to resolve against.
 * @returns The combined list of allowed namespaces.
 */
export function getCombinedAllowedNamespaces(
  cluster: string,
  adminSettings?: AdminSettingsState | null | unknown
): string[] {
  const { allowedNamespaces, selector } = getResolvedNamespaceConfig(cluster, adminSettings);
  if (allowedNamespaces.length === 0 && !selector) {
    return getDiscoveredNamespaces(cluster) ?? [];
  }
  const cache = selector ? loadResolvedAllowedNamespaces(cluster) : null;
  const resolved = cache && cache.selector === selector ? cache.namespaces : [];
  return [...new Set([...allowedNamespaces, ...resolved])].sort();
}

/**
 * Whether the only namespace restriction of a cluster comes from namespace
 * discovery (nothing configured in the settings). Discovery only checks a few
 * resource kinds, so callers may lift it for kinds the user can list cluster-wide.
 *
 * @param cluster - The name of the cluster.
 * @param adminSettings - Optional admin settings state to resolve against.
 */
export function isRestrictedOnlyByDiscovery(
  cluster: string,
  adminSettings?: AdminSettingsState | null | unknown
): boolean {
  const { allowedNamespaces, selector } = getResolvedNamespaceConfig(cluster, adminSettings);
  return (
    allowedNamespaces.length === 0 && !selector && getDiscoveredNamespaces(cluster) !== undefined
  );
}

/**
 * Checks whether a cluster has an explicit, selector-based or discovered namespace restriction.
 *
 * @param cluster - Cluster whose settings should be checked.
 * @param adminSettings - Optional admin settings state to resolve against.
 * @returns Whether namespace access is restricted, including when a selector or
 *          discovery resolves empty.
 */
export function hasAllowedNamespacesRestriction(
  cluster: string,
  adminSettings?: AdminSettingsState | null | unknown
): boolean {
  const { allowedNamespaces, selector } = getResolvedNamespaceConfig(cluster, adminSettings);
  return (
    allowedNamespaces.length > 0 ||
    Boolean(selector) ||
    getDiscoveredNamespaces(cluster) !== undefined
  );
}
