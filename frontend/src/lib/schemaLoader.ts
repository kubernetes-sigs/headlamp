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

import type { OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import { clusterRequest } from './k8s/api/v1/clusterRequests';

/** Parameters for loading a Kubernetes resource schema */
export interface LoadResourceSchemaParams {
  /** Explicit cluster connection name (must not be empty) */
  cluster: string;
  /** API version (e.g. 'v1', 'apps/v1', 'batch/v1', or 'custom.example.com/v1alpha1') */
  apiVersion: string;
  /** Exact resource kind (e.g. 'Pod', 'Deployment', 'MyCRD') */
  kind: string;
  /** Force refresh of discovery and schema document */
  refresh?: boolean;
}

export type SchemaDocument = OpenAPIV3.Document | OpenAPIV2.Document;
export type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject;

/** Result of loading a resource schema */
export interface LoadedResourceSchema {
  /**
   * The matched schema definition, or null if the group/version exists but
   * does not define this exact resource kind, or if the resource kind/CRD
   * is not installed on the cluster.
   */
  schema: SchemaObject | null;
  /**
   * The full un-mutated source document, allowing resolution of local $ref components.
   * Null if the group/version is not installed on the cluster.
   */
  document: SchemaDocument | null;
  /** The server-advertised relative URL from which the document was loaded */
  sourceUrl: string;
  /** Dialect indicator */
  sourceFormat: 'openapi/v3' | 'openapi/v2';
}

/** Discovery index paths entry shape returned by Kubernetes /openapi/v3 */
export interface OpenAPIV3DiscoveryIndex {
  paths: Record<
    string,
    {
      serverRelativeURL: string;
    }
  >;
}

interface ClusterCacheEntry {
  generation: number;
  discoveryRequestId: number;
  discoveryPromise: Promise<OpenAPIV3DiscoveryIndex> | null;
  refreshDiscoveryPromise: Promise<OpenAPIV3DiscoveryIndex> | null;
  discoveryData: OpenAPIV3DiscoveryIndex | null;
  v3Supported: boolean | null;
  documents: Map<string, Promise<SchemaDocument>>;
  documentRefreshes: Map<string, Promise<OpenAPIV3.Document>>;
  v2Promise: Promise<OpenAPIV2.Document> | null;
  v2RefreshPromise: Promise<OpenAPIV2.Document> | null;
  missingDiscoveryKeys: Set<string>;
}

const clusterCaches = new Map<string, ClusterCacheEntry>();

function getOrCreateClusterCache(cluster: string): ClusterCacheEntry {
  let cache = clusterCaches.get(cluster);
  if (!cache) {
    cache = {
      generation: 0,
      discoveryRequestId: 0,
      discoveryPromise: null,
      refreshDiscoveryPromise: null,
      discoveryData: null,
      v3Supported: null,
      documents: new Map(),
      documentRefreshes: new Map(),
      v2Promise: null,
      v2RefreshPromise: null,
      missingDiscoveryKeys: new Set(),
    };
    clusterCaches.set(cluster, cache);
  }
  return cache;
}

/**
 * Resets the in-memory schema loader cache for a given cluster,
 * or for all clusters if no cluster name is specified.
 */
export function resetSchemaLoaderCache(cluster?: string): void {
  if (cluster) {
    const cache = clusterCaches.get(cluster);
    if (cache) {
      cache.generation += 1;
      cache.discoveryRequestId = 0;
      cache.discoveryPromise = null;
      cache.refreshDiscoveryPromise = null;
      cache.discoveryData = null;
      cache.v3Supported = null;
      cache.documents.clear();
      cache.documentRefreshes.clear();
      cache.v2Promise = null;
      cache.v2RefreshPromise = null;
      cache.missingDiscoveryKeys.clear();
    }
  } else {
    for (const cache of clusterCaches.values()) {
      cache.generation += 1;
      cache.discoveryRequestId = 0;
      cache.discoveryPromise = null;
      cache.refreshDiscoveryPromise = null;
      cache.discoveryData = null;
      cache.v3Supported = null;
      cache.documents.clear();
      cache.documentRefreshes.clear();
      cache.v2Promise = null;
      cache.v2RefreshPromise = null;
      cache.missingDiscoveryKeys.clear();
    }
    clusterCaches.clear();
  }
}

/**
 * Validates that an advertised serverRelativeURL is safely contained within
 * the expected Kubernetes OpenAPI route and does not target external origins
 * or escape paths via raw or encoded traversal.
 */
export function validateAdvertisedUrl(url: string): void {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Advertised schema URL must be a non-empty string');
  }

  // Reject scheme (http:, https:, javascript:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    throw new Error(`Unexpected absolute URL advertised for OpenAPI document: ${url}`);
  }

  // Reject protocol-relative URLs
  if (url.startsWith('//')) {
    throw new Error(`Unexpected protocol-relative URL advertised for OpenAPI document: ${url}`);
  }

  // Separate the pathname component from query string / hash so query parameters are not modified
  const [rawPath] = url.split(/[?#]/);

  // Reject raw backslashes and encoded backslashes (%5C / %5c)
  if (rawPath.includes('\\') || /%5c/i.test(rawPath)) {
    throw new Error(`Backslashes are not permitted in advertised URL: ${url}`);
  }

  // Reject encoded dot segments (%2e / %2E) and encoded slashes (%2f / %2F) in the pathname
  if (/%2e/i.test(rawPath) || /%2f/i.test(rawPath)) {
    throw new Error(
      `Encoded path traversal or separator is not permitted in advertised URL: ${url}`
    );
  }

  // Reject raw directory traversal in pathname
  if (rawPath.includes('..')) {
    throw new Error(`Path traversal is not permitted in advertised URL: ${url}`);
  }

  // Decode pathname component to verify absence of decoded traversal or control characters
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error(`Malformed URL encoding in advertised URL: ${url}`);
  }

  if (/[\t\r\n]/.test(decodedPath)) {
    throw new Error(`Control characters are not permitted in advertised URL: ${url}`);
  }

  if (decodedPath.includes('..') || decodedPath.includes('\\')) {
    throw new Error(`Path traversal is not permitted in advertised URL: ${url}`);
  }

  const normalizedDecoded = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`;
  const segments = normalizedDecoded.split('/');
  if (segments.some(seg => seg === '.' || seg === '..')) {
    throw new Error(`Path traversal is not permitted in advertised URL: ${url}`);
  }

  // Enforce canonical route boundary using WHATWG URL parser
  const normalizedRaw = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  let canonicalPath: string;
  try {
    canonicalPath = new URL(normalizedRaw, 'http://localhost').pathname;
  } catch {
    throw new Error(`Invalid URL path: ${url}`);
  }

  if (canonicalPath !== '/openapi/v3' && !canonicalPath.startsWith('/openapi/v3/')) {
    throw new Error(`Advertised URL does not target the expected OpenAPI v3 route: ${url}`);
  }

  if (normalizedDecoded !== '/openapi/v3' && !normalizedDecoded.startsWith('/openapi/v3/')) {
    throw new Error(`Advertised URL does not target the expected OpenAPI v3 route: ${url}`);
  }
}

/**
 * Maps an apiVersion string into the group and version components,
 * and produces the discovery index key used in OpenAPI v3 paths.
 */
export function mapApiVersionToDiscoveryKey(apiVersion: string): {
  group: string;
  version: string;
  discoveryKey: string;
} {
  if (!apiVersion || typeof apiVersion !== 'string') {
    throw new Error(`Invalid apiVersion: ${apiVersion}`);
  }

  const parts = apiVersion.split('/');
  let group = '';
  let version = '';

  if (parts.length === 1) {
    version = parts[0];
    group = '';
  } else {
    group = parts[0];
    version = parts.slice(1).join('/');
  }

  const discoveryKey = group ? `apis/${group}/${version}` : `api/${version}`;
  return { group, version, discoveryKey };
}

/**
 * Checks if an error represents an unsupported endpoint (404 Not Found or 501 Not Implemented).
 */
function isEndpointUnsupported(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    return status === 404 || status === 501;
  }
  return false;
}

/**
 * Checks if an error represents an HTTP redirect response (3xx) or opaque redirect (status 0).
 */
function isRedirectError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    if ('status' in err) {
      const status = (err as { status: number }).status;
      return status === 0 || (status >= 300 && status < 400);
    }
    if ('type' in err && (err as { type: string }).type === 'opaqueredirect') {
      return true;
    }
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      const msg = (err as { message: string }).message.toLowerCase();
      if (msg.includes('redirect') || msg.includes('opaqueredirect')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves a local JSON pointer reference against the document without modifying
 * or destructively inlining the document.
 */
export function resolveLocalRef(ref: string, document: SchemaDocument): SchemaObject | null {
  if (!ref || !ref.startsWith('#')) {
    return null;
  }

  let pointer: string;
  try {
    // URI fragment decoding precedes JSON Pointer tokenization and unescaping.
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    return null;
  }
  if (!pointer.startsWith('/')) {
    return null;
  }

  const tokens = pointer
    .slice(1)
    .split('/')
    .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: any = document;
  for (const token of tokens) {
    if (current && typeof current === 'object' && token in current) {
      current = current[token];
    } else {
      return null;
    }
  }

  return (current as SchemaObject) ?? null;
}

/**
 * Fetches the OpenAPI v3 discovery index for a cluster, with deduplication,
 * request identity tracking, and error caching protection.
 */
async function fetchOpenAPIV3Discovery(
  cluster: string,
  forceRefresh: boolean = false
): Promise<OpenAPIV3DiscoveryIndex> {
  const cache = getOrCreateClusterCache(cluster);
  const currentGen = cache.generation;

  if (!forceRefresh) {
    if (cache.discoveryData && cache.v3Supported) {
      return cache.discoveryData;
    }
    if (cache.refreshDiscoveryPromise) {
      return cache.refreshDiscoveryPromise;
    }
    if (cache.discoveryPromise) {
      return cache.discoveryPromise;
    }
  } else {
    // If a revalidation request is already pending, reuse it
    if (cache.refreshDiscoveryPromise) {
      return cache.refreshDiscoveryPromise;
    }
  }

  const requestId = ++cache.discoveryRequestId;

  const requestHolder: { promise?: Promise<OpenAPIV3DiscoveryIndex> } = {};
  requestHolder.promise = (async () => {
    try {
      const data = await clusterRequest('/openapi/v3', {
        cluster,
        isJSON: true,
        autoLogoutOnAuthError: false,
        redirect: 'manual',
      });

      if (!data || typeof data !== 'object' || !data.paths) {
        throw new Error('Malformed OpenAPI v3 discovery response: missing paths map');
      }

      // Check both generation and request identity so an older request
      // cannot overwrite cache state established by a newer request.
      if (cache.generation === currentGen && cache.discoveryRequestId === requestId) {
        cache.discoveryData = data as OpenAPIV3DiscoveryIndex;
        cache.v3Supported = true;
        // Other absent groups remain negative-cached across discovery refreshes.
        for (const key of cache.missingDiscoveryKeys) {
          if (data.paths[key]) {
            cache.missingDiscoveryKeys.delete(key);
          }
        }
        // Retain only documents still advertised, including their hash identity.
        const advertisedUrls = new Set(
          Object.values((data as OpenAPIV3DiscoveryIndex).paths).map(
            entry => entry.serverRelativeURL
          )
        );
        for (const url of cache.documents.keys()) {
          if (!advertisedUrls.has(url)) {
            cache.documents.delete(url);
            cache.documentRefreshes.delete(url);
          }
        }
      }
      return data as OpenAPIV3DiscoveryIndex;
    } catch (err) {
      if (cache.generation === currentGen && cache.discoveryRequestId === requestId) {
        if (isEndpointUnsupported(err)) {
          cache.v3Supported = false;
        }
      }
      throw err;
    } finally {
      if (cache.generation === currentGen) {
        if (cache.discoveryPromise === requestHolder.promise) {
          cache.discoveryPromise = null;
        }
        if (cache.refreshDiscoveryPromise === requestHolder.promise) {
          cache.refreshDiscoveryPromise = null;
        }
      }
    }
  })();

  const promise = requestHolder.promise;
  if (forceRefresh) {
    cache.refreshDiscoveryPromise = promise;
  } else {
    cache.discoveryPromise = promise;
  }

  return promise;
}

/**
 * Fetches and parses a single OpenAPI v3 group/version document, deduplicated
 * per cluster and complete advertised URL.
 */
async function fetchDocument(
  cluster: string,
  serverRelativeURL: string,
  forceRefresh: boolean = false
): Promise<OpenAPIV3.Document> {
  validateAdvertisedUrl(serverRelativeURL);

  const cache = getOrCreateClusterCache(cluster);
  const currentGen = cache.generation;

  const pendingRefresh = cache.documentRefreshes.get(serverRelativeURL);
  if (pendingRefresh) {
    return pendingRefresh;
  }
  if (!forceRefresh && cache.documents.has(serverRelativeURL)) {
    return (await cache.documents.get(serverRelativeURL)!) as OpenAPIV3.Document;
  }

  const requestHolder: { promise?: Promise<OpenAPIV3.Document> } = {};
  requestHolder.promise = (async () => {
    try {
      const doc = await clusterRequest(serverRelativeURL, {
        cluster,
        isJSON: true,
        autoLogoutOnAuthError: false,
        redirect: 'manual',
      });

      if (!doc || typeof doc !== 'object') {
        throw new Error(`Malformed OpenAPI document returned from ${serverRelativeURL}`);
      }

      return doc as OpenAPIV3.Document;
    } catch (err) {
      // Remove failed promise so subsequent requests can retry,
      // but only if this exact promise is still the active cached entry.
      if (
        cache.generation === currentGen &&
        cache.documents.get(serverRelativeURL) === requestHolder.promise
      ) {
        cache.documents.delete(serverRelativeURL);
      }
      throw err;
    } finally {
      if (
        cache.generation === currentGen &&
        cache.documentRefreshes.get(serverRelativeURL) === requestHolder.promise
      ) {
        cache.documentRefreshes.delete(serverRelativeURL);
      }
    }
  })();

  const promise = requestHolder.promise;
  if (forceRefresh) {
    cache.documentRefreshes.set(serverRelativeURL, promise);
  }
  cache.documents.set(serverRelativeURL, promise);
  return promise;
}

/**
 * Fetches the aggregated OpenAPI v2 document as compatibility fallback.
 */
async function fetchOpenAPIV2Fallback(
  cluster: string,
  forceRefresh: boolean = false
): Promise<OpenAPIV2.Document> {
  const cache = getOrCreateClusterCache(cluster);
  const currentGen = cache.generation;

  if (cache.v2RefreshPromise) {
    return cache.v2RefreshPromise;
  }
  if (!forceRefresh && cache.v2Promise) {
    return cache.v2Promise;
  }

  const requestHolder: { promise?: Promise<OpenAPIV2.Document> } = {};
  requestHolder.promise = (async () => {
    try {
      const doc = await clusterRequest('/openapi/v2', {
        cluster,
        isJSON: true,
        autoLogoutOnAuthError: false,
        redirect: 'manual',
      });

      if (!doc || typeof doc !== 'object' || !doc.definitions) {
        throw new Error('Malformed OpenAPI v2 document: missing definitions');
      }

      return doc as OpenAPIV2.Document;
    } catch (err) {
      if (cache.generation === currentGen && cache.v2Promise === requestHolder.promise) {
        cache.v2Promise = null;
      }
      throw err;
    } finally {
      if (cache.generation === currentGen && cache.v2RefreshPromise === requestHolder.promise) {
        cache.v2RefreshPromise = null;
      }
    }
  })();

  const promise = requestHolder.promise;
  if (forceRefresh) {
    cache.v2RefreshPromise = promise;
  }
  cache.v2Promise = promise;
  return promise;
}

/**
 * Matches exact group, version, and kind in OpenAPI schemas using
 * x-kubernetes-group-version-kind metadata.
 */
function findExactGVKSchema(
  schemas: Record<string, any>,
  group: string,
  version: string,
  kind: string
): SchemaObject | null {
  for (const schema of Object.values(schemas)) {
    if (!schema || typeof schema !== 'object') continue;
    const gvkList = schema['x-kubernetes-group-version-kind'];
    if (!Array.isArray(gvkList)) continue;

    const matched = gvkList.some(
      (gvk: any) =>
        gvk &&
        typeof gvk === 'object' &&
        (gvk.group ?? '') === group &&
        gvk.version === version &&
        gvk.kind === kind
    );

    if (matched) {
      return schema as SchemaObject;
    }
  }

  return null;
}

/**
 * Loads a resource schema with OpenAPI v3 discovery, exact GVK matching,
 * cluster-isolated caching, and seamless v2 fallback.
 */
export async function loadResourceSchema(
  params: LoadResourceSchemaParams
): Promise<LoadedResourceSchema> {
  const { cluster, apiVersion, kind, refresh = false } = params;

  if (!cluster || typeof cluster !== 'string' || !cluster.trim()) {
    throw new Error('Cluster identity is required for schema loading');
  }

  if (!apiVersion || typeof apiVersion !== 'string' || !apiVersion.trim()) {
    throw new Error('apiVersion is required for schema loading');
  }

  if (!kind || typeof kind !== 'string' || !kind.trim()) {
    throw new Error('kind is required for schema loading');
  }

  const { group, version, discoveryKey } = mapApiVersionToDiscoveryKey(apiVersion);
  const cache = getOrCreateClusterCache(cluster);
  // Keep the original identity through discovery, retries, and fallback.
  const generation = cache.generation;
  const assertCurrent = () => {
    if (clusterCaches.get(cluster) !== cache || cache.generation !== generation) {
      throw new Error(`Schema cache was reset for cluster ${cluster}; retry schema loading`);
    }
  };
  const loadFallback = async () => {
    assertCurrent();
    try {
      return await loadViaV2Fallback(cluster, group, version, kind, refresh);
    } finally {
      assertCurrent();
    }
  };

  // If v3 is known to be unsupported on this cluster, use v2 fallback directly
  if (cache.v3Supported === false && !refresh) {
    return loadFallback();
  }

  try {
    let discovery = await fetchOpenAPIV3Discovery(cluster, refresh);
    assertCurrent();

    let advertisedEntry = discovery.paths[discoveryKey];

    // If the group/version is not in discovery, re-check once unless already known missing in this generation
    if (!advertisedEntry && !refresh) {
      if (!cache.missingDiscoveryKeys.has(discoveryKey)) {
        discovery = await fetchOpenAPIV3Discovery(cluster, true);
        assertCurrent();
        advertisedEntry = discovery.paths[discoveryKey];
        if (!advertisedEntry) {
          cache.missingDiscoveryKeys.add(discoveryKey);
        }
      }
    }

    // If still missing after refresh:
    if (!advertisedEntry) {
      // Aggregated API servers may publish v2 schemas without advertising v3.
      return await loadFallback();
    }

    const advertisedUrl = advertisedEntry.serverRelativeURL;
    let document: OpenAPIV3.Document;
    let finalSourceUrl = advertisedUrl;

    try {
      document = await fetchDocument(cluster, advertisedUrl, refresh);
    } catch (docErr) {
      assertCurrent();
      // If advertised document returns 404, 501, or redirect (e.g. stale hash/rotation), re-read discovery once
      if (isEndpointUnsupported(docErr) || isRedirectError(docErr)) {
        const refreshedDiscovery = await fetchOpenAPIV3Discovery(cluster, true);
        assertCurrent();
        const refreshedEntry = refreshedDiscovery.paths[discoveryKey];

        if (refreshedEntry && refreshedEntry.serverRelativeURL !== advertisedUrl) {
          // Retry newly advertised URL through explicit cluster transport without forcing cache bypass
          finalSourceUrl = refreshedEntry.serverRelativeURL;
          document = await fetchDocument(cluster, refreshedEntry.serverRelativeURL);
        } else if (!refreshedEntry) {
          // A group removed from v3 may still be served by a v2-only API server.
          cache.missingDiscoveryKeys.add(discoveryKey);
          return await loadFallback();
        } else {
          // Advertised URL is unchanged and still broken; report failure
          throw docErr;
        }
      } else {
        throw docErr;
      }
    }

    assertCurrent();
    const schemas = document.components?.schemas || {};
    const schema = findExactGVKSchema(schemas, group, version, kind);

    return {
      schema,
      document,
      sourceUrl: finalSourceUrl,
      sourceFormat: 'openapi/v3',
    };
  } catch (v3Err) {
    assertCurrent();
    // If OpenAPI v3 endpoint is genuinely unsupported (404/501), fall back to v2
    if (isEndpointUnsupported(v3Err)) {
      return await loadFallback();
    }

    // Preserve authentication, authorization, timeouts, and network errors
    throw v3Err;
  }
}

/**
 * Loads a resource schema using OpenAPI v2 compatibility fallback.
 */
async function loadViaV2Fallback(
  cluster: string,
  group: string,
  version: string,
  kind: string,
  refresh: boolean
): Promise<LoadedResourceSchema> {
  const document = await fetchOpenAPIV2Fallback(cluster, refresh);
  const definitions = document.definitions || {};
  const schema = findExactGVKSchema(definitions, group, version, kind);

  return {
    schema,
    document,
    sourceUrl: '/openapi/v2',
    sourceFormat: 'openapi/v2',
  };
}
