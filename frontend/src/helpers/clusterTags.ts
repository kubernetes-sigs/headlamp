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

import type { Cluster } from '../lib/k8s/cluster';
import { ClusterSettings, loadClusterSettings, storeClusterSettings } from './clusterSettings';

/** Headlamp key/value tags attached to a cluster. */
export type ClusterTags = Record<string, string>;

/** A single `key=value` requirement used to filter clusters. */
export interface ClusterTagFilter {
  key: string;
  value: string;
}

/** Dispatched on `window` whenever cluster tags are changed in this window. */
export const CLUSTER_TAGS_CHANGED_EVENT = 'headlamp-cluster-tags-changed';

/** Identifies the source owning a tag draft, excluding refreshable tag metadata. */
export function getClusterTagIdentity(name: string, cluster?: Cluster | null): string {
  const clusterID = cluster?.meta_data?.clusterID;
  return JSON.stringify([
    name,
    clusterID || null,
    cluster?.meta_data?.source ?? null,
    cluster?.server ?? null,
    cluster?.auth_type ?? null,
  ]);
}

/** Captures ownership without invalidating snapshots for tag or token-choice refreshes. */
export function getClusterConfigIdentity(clusters: Record<string, Cluster> | null): string {
  return JSON.stringify(
    clusters === null
      ? null
      : Object.keys(clusters)
          .sort()
          .map(name => getClusterTagIdentity(name, clusters[name]))
  );
}

const TAG_NAME_MAX_LENGTH = 63;
const TAG_PREFIX_MAX_LENGTH = 253;
const TAG_NAME_REGEX = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const DNS_SUBDOMAIN_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

/**
 * Returns whether a string is a valid tag key, e.g. "environment" or
 * "example.com/team".
 */
export function isValidTagKey(key: string): boolean {
  if (typeof key !== 'string' || !key) {
    return false;
  }
  const parts = key.split('/');
  if (parts.length > 2) {
    return false;
  }
  const name = parts.pop() as string;
  const prefix = parts.pop();
  if (
    prefix !== undefined &&
    (prefix.length > TAG_PREFIX_MAX_LENGTH || !DNS_SUBDOMAIN_REGEX.test(prefix))
  ) {
    return false;
  }
  return name.length <= TAG_NAME_MAX_LENGTH && TAG_NAME_REGEX.test(name);
}

/** Returns whether a string is a valid tag value (empty values are allowed). */
export function isValidTagValue(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return value === '' || (value.length <= TAG_NAME_MAX_LENGTH && TAG_NAME_REGEX.test(value));
}

/** Returns the keys of tags whose key or value is not valid tag syntax. */
export function getInvalidTagKeys(tags: ClusterTags): string[] {
  return Object.entries(tags)
    .filter(([key, value]) => !isValidTagKey(key) || !isValidTagValue(value))
    .map(([key]) => key);
}

/** Keeps only valid string tags, dropping anything malformed found in storage. */
export function sanitizeClusterTags(raw: unknown): ClusterTags {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const tags: ClusterTags = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && isValidTagKey(key) && isValidTagValue(value)) {
      tags[key] = value;
    }
  }
  return tags;
}

/** Loads the sanitized tags for a cluster from its local settings. */
export function loadClusterTags(
  clusterName: string,
  cluster?: Cluster | null,
  settings = loadClusterSettings(clusterName)
): ClusterTags {
  return sanitizeClusterTags(settings.tags ?? cluster?.meta_data?.extensions?.headlamp_info?.tags);
}

/** Returns a copy of the local settings with tags. */
export function withClusterTags(settings: ClusterSettings, tags: ClusterTags) {
  return { ...settings, tags: { ...tags } };
}

/** Notifies listeners in this window that cluster tags have changed. */
export function notifyClusterTagsChanged() {
  window.dispatchEvent(new Event(CLUSTER_TAGS_CHANGED_EVENT));
}

/**
 * Stores the tags for a cluster in its local settings, preserving other settings.
 * Throws if any tag is not valid tag syntax.
 */
export function storeClusterTags(clusterName: string, tags: ClusterTags) {
  if (!clusterName) {
    return;
  }
  const invalidKeys = getInvalidTagKeys(tags);
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid cluster tags: ${invalidKeys.join(', ')}`);
  }
  storeClusterSettings(clusterName, withClusterTags(loadClusterSettings(clusterName), tags));
  notifyClusterTagsChanged();
}

/** Formats a tag as `key=value`. */
export function formatClusterTag(key: string, value: string) {
  return `${key}=${value}`;
}

/** Parses a `key=value` string into a filter, or returns null when it is malformed. */
export function parseClusterTagFilter(text: string): ClusterTagFilter | null {
  if (typeof text !== 'string') {
    return null;
  }
  const separator = text.indexOf('=');
  if (separator <= 0) {
    return null;
  }
  const key = text.slice(0, separator);
  const value = text.slice(separator + 1);
  if (!isValidTagKey(key) || !isValidTagValue(value)) {
    return null;
  }
  return { key, value };
}

/**
 * Returns whether tags satisfy the filters. Like a Kubernetes set-based selector,
 * values for the same key are alternatives (`key in (a, b)`) and different keys must all
 * match (AND).
 */
export function matchesClusterTagFilters(tags: ClusterTags, filters: ClusterTagFilter[]): boolean {
  const valuesByKey = new Map<string, Set<string>>();
  for (const { key, value } of filters) {
    if (!valuesByKey.has(key)) {
      valuesByKey.set(key, new Set());
    }
    valuesByKey.get(key)!.add(value);
  }
  for (const [key, values] of valuesByKey) {
    if (!Object.prototype.hasOwnProperty.call(tags, key) || !values.has(tags[key])) {
      return false;
    }
  }
  return true;
}

/** Returns the sorted tag keys and `key=value` pairs used across the given clusters. */
export function collectClusterTagOptions(tagsByCluster: Record<string, ClusterTags>) {
  const keys = new Set<string>();
  const pairs = new Set<string>();
  for (const tags of Object.values(tagsByCluster)) {
    for (const [key, value] of Object.entries(tags)) {
      keys.add(key);
      pairs.add(formatClusterTag(key, value));
    }
  }
  const compare = (a: string, b: string) => a.localeCompare(b);
  return { keys: [...keys].sort(compare), pairs: [...pairs].sort(compare) };
}
