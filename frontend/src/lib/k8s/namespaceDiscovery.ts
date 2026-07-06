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

/**
 * Namespace discovery for users who cannot `list namespaces` cluster-wide.
 *
 * **RoleBindings only:** namespace names are derived from namespaced RoleBindings
 * (`GET /apis/rbac.authorization.k8s.io/v1/rolebindings`). ClusterRoleBindings are
 * not listed — they have no `metadata.namespace`. Cluster-wide list routing uses
 * cluster-scoped SelfSubjectAccessReview (`list pods`), not CRB enumeration.
 *
 * @see usesDiscoveredNamespaceRouting in useDiscoveredNamespaces.ts for UI routing
 */

import { loadClusterSettings } from '../../helpers/clusterSettings';
import store from '../../redux/stores/store';
import type { ClusterUserInfo } from './api/v1/clusterApi';
import { getClusterUserInfoForRbac, isFallbackClusterIdentity } from './api/v1/clusterApi';
import { clusterRequest, post } from './api/v1/clusterRequests';
import type { ApiError } from './api/v2/ApiError';

/** Thrown when discovery runs before OIDC/session identity is available; triggers a retry. */
export class AuthNotReadyForDiscoveryError extends Error {
  constructor() {
    super('Authentication not ready for namespace discovery');
    this.name = 'AuthNotReadyForDiscoveryError';
  }
}

export interface RoleBindingDiscoveryResult {
  namespaces: string[];
  /** True when GET /rolebindings returned an error (typically 403). */
  listFailed: boolean;
  /** Number of RoleBindings returned by the API (before subject filtering). */
  bindingCount: number;
}

export type NamespaceDiscoveryErrorCode =
  | 'list_rolebindings_denied'
  | 'no_matching_bindings'
  | 'discovery_failed'
  | 'auth_not_ready';

export interface NamespaceDiscoveryError {
  code: NamespaceDiscoveryErrorCode;
  /** Formatted Kubernetes identity for display in error messages. */
  identity: string;
}

function formatIdentityForError(userInfo: ClusterUserInfo): string {
  const groups =
    userInfo.groups && userInfo.groups.length > 0 ? userInfo.groups.join(', ') : '(none)';
  return `user=${userInfo.username ?? 'unknown'}, groups=${groups}`;
}

function isAccessDeniedError(error: unknown): boolean {
  const status = (error as ApiError)?.status;
  return status === 403 || status === 401;
}

export function buildDiscoveryError(
  userInfo: ClusterUserInfo,
  roleBindingDiscovery: RoleBindingDiscoveryResult
): NamespaceDiscoveryError {
  const identity = formatIdentityForError(userInfo);

  if (roleBindingDiscovery.listFailed) {
    return { code: 'list_rolebindings_denied', identity };
  }

  if (roleBindingDiscovery.bindingCount > 0) {
    return { code: 'no_matching_bindings', identity };
  }

  return { code: 'discovery_failed', identity };
}

export type NamespaceDiscoverySource =
  | 'api' // list namespaces API succeeded (legacy cluster-wide metadata path)
  | 'rolebindings' // namespaces from namespaced RoleBindings
  | 'clusterwide' // cluster-scoped SSAR detected list access without namespace set
  | 'fallback' // Settings / kubeconfig default namespace (not RBAC enumeration)
  | 'none'; // discovery failed

export interface NamespaceDiscoveryResult {
  namespaces: string[];
  isClusterWide: boolean;
  source: NamespaceDiscoverySource;
  error?: NamespaceDiscoveryError;
}

export interface KubeBindingSubject {
  kind: string;
  name: string;
  apiGroup?: string;
  namespace?: string;
}

export interface KubeBinding {
  metadata?: { namespace?: string; name?: string };
  subjects?: KubeBindingSubject[];
}

interface KubeListResponse<T> {
  items?: T[];
}

/**
 * Returns true if a binding subject matches the current user (User or Group).
 * Used when filtering RoleBinding subjects during namespace discovery.
 */
export function subjectMatchesUser(
  subject: KubeBindingSubject,
  userInfo: ClusterUserInfo
): boolean {
  const username = userInfo.username;
  if (!username) {
    return false;
  }

  const kind = subject.kind || 'User';
  if (kind === 'User' && subject.name === username) {
    return true;
  }
  if (kind === 'Group' && userInfo.groups?.includes(subject.name)) {
    return true;
  }
  return false;
}

/**
 * Returns true if any subject on the binding matches the current user.
 */
export function bindingMatchesUser(binding: KubeBinding, userInfo: ClusterUserInfo): boolean {
  return (binding.subjects || []).some(subject => subjectMatchesUser(subject, userInfo));
}

/**
 * Extracts namespace names from RoleBindings that match the current user.
 */
export function extractNamespacesFromRoleBindings(
  roleBindings: KubeBinding[],
  userInfo: ClusterUserInfo
): string[] {
  const namespaces = new Set<string>();
  for (const binding of roleBindings) {
    if (bindingMatchesUser(binding, userInfo) && binding.metadata?.namespace) {
      namespaces.add(binding.metadata.namespace);
    }
  }
  return [...namespaces].sort((a, b) => a.localeCompare(b));
}

interface SelfSubjectAccessReviewSpec {
  resourceAttributes?: {
    namespace?: string;
    verb?: string;
    resource?: string;
  };
}

async function selfSubjectAccessReview(
  cluster: string,
  spec: SelfSubjectAccessReviewSpec
): Promise<boolean> {
  const response = await post(
    '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
    {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec,
    },
    false,
    {
      timeout: 5 * 1000,
      cluster,
    }
  );

  return response?.status?.allowed === true;
}

/**
 * Returns true when the user can list a namespaced resource cluster-wide (no namespace set).
 * This is the authoritative signal for cluster-wide Headlamp routing, unlike CRB subject match.
 */
export async function canListResourcesClusterWide(
  cluster: string,
  verb = 'list',
  resource = 'pods'
): Promise<boolean> {
  try {
    return await selfSubjectAccessReview(cluster, {
      resourceAttributes: {
        verb,
        resource,
      },
    });
  } catch {
    return false;
  }
}

async function listNamespacesViaApi(cluster: string): Promise<string[] | null> {
  try {
    const response: KubeListResponse<{ metadata: { name: string } }> = await clusterRequest(
      '/api/v1/namespaces',
      { cluster }
    );
    const items = response?.items || [];
    return items.map(ns => ns.metadata.name).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (isAccessDeniedError(error)) {
      return null;
    }
    throw error;
  }
}

export const ROLE_BINDINGS_LIST_PATH = '/apis/rbac.authorization.k8s.io/v1/rolebindings';

/**
 * Discovers namespace names from namespaced RoleBindings whose subjects match the user.
 *
 * Only RoleBindings are listed: each namespace comes from `metadata.namespace`.
 * ClusterRoleBindings are not queried here (they are cluster-scoped and do not
 * name namespaces). Cluster-wide list routing is detected via SSAR in
 * {@link discoverAccessibleNamespaces}, not by listing ClusterRoleBindings.
 */
export async function discoverNamespacesViaRoleBindings(
  cluster: string,
  userInfo: ClusterUserInfo
): Promise<RoleBindingDiscoveryResult> {
  let roleBindings: KubeBinding[] = [];
  let listFailed = false;

  try {
    const response: KubeListResponse<KubeBinding> = await clusterRequest(ROLE_BINDINGS_LIST_PATH, {
      cluster,
    });
    roleBindings = response?.items || [];
  } catch (error) {
    if (isAccessDeniedError(error)) {
      roleBindings = [];
      listFailed = true;
    } else {
      throw error;
    }
  }

  return {
    namespaces: extractNamespacesFromRoleBindings(roleBindings, userInfo),
    listFailed,
    bindingCount: roleBindings.length,
  };
}

function getFallbackNamespaces(cluster: string): string[] {
  const fromSettings = loadClusterSettings(cluster)?.defaultNamespace;
  const fromKubeconfig: string = store.getState().config?.clusters?.[cluster]?.meta_data?.namespace;
  const fallbacks = [fromSettings, fromKubeconfig].filter(Boolean) as string[];
  return [...new Set(fallbacks)];
}

/**
 * Discovers namespaces the current user can access using a priority chain:
 * 1. List namespaces API
 * 2. Namespaced RoleBinding enumeration (ClusterRoleBindings are not listed)
 * 3. SSAR cluster-scoped check for true cluster-wide routing (source `clusterwide`)
 * 4. Default namespace fallbacks
 */
export async function discoverAccessibleNamespaces(
  cluster: string
): Promise<NamespaceDiscoveryResult> {
  // Step 1: direct namespace list (requires cluster-wide list namespaces permission).
  const apiNamespaces = await listNamespacesViaApi(cluster);
  if (apiNamespaces !== null) {
    return {
      namespaces: apiNamespaces,
      isClusterWide: false,
      source: 'api',
    };
  }

  // Step 2: derive namespaces from RoleBindings for the authenticated user.
  const userInfo = await getClusterUserInfoForRbac(cluster);
  const roleBindingDiscovery = await discoverNamespacesViaRoleBindings(cluster, userInfo);
  const bindingNamespaces = roleBindingDiscovery.namespaces;

  if (bindingNamespaces.length > 0) {
    // RoleBinding membership is authoritative; do not SSAR-filter by list pods — bindings
    // may grant other resources (configmaps, secrets) without list pods permission.
    return {
      namespaces: bindingNamespaces,
      isClusterWide: false,
      source: 'rolebindings',
    };
  }

  // Step 3: no namespaced RoleBindings — detect cluster-wide access via SSAR
  // (not by listing ClusterRoleBindings).
  if (await canListResourcesClusterWide(cluster)) {
    return {
      namespaces: [],
      isClusterWide: true,
      source: 'clusterwide',
    };
  }

  const fallbackNamespaces = getFallbackNamespaces(cluster);
  if (fallbackNamespaces.length > 0) {
    return {
      namespaces: fallbackNamespaces,
      isClusterWide: false,
      source: 'fallback',
    };
  }

  // After OIDC login, /me and SelfSubjectReview can fail briefly while cookies propagate.
  // user=main (cluster name) + rolebindings 403 is this race — retry instead of showing an error.
  if (roleBindingDiscovery.listFailed && isFallbackClusterIdentity(userInfo)) {
    throw new AuthNotReadyForDiscoveryError();
  }

  return {
    namespaces: [],
    isClusterWide: false,
    source: 'none',
    error: buildDiscoveryError(userInfo, roleBindingDiscovery),
  };
}
