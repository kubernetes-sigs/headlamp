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

import { ClusterSettings, loadClusterSettings, storeClusterSettings } from './clusterSettings';

/** Kubernetes-style key/value labels attached to a cluster. */
export type ClusterLabels = Record<string, string>;

/** A single `key=value` requirement used to filter clusters. */
export interface ClusterLabelFilter {
  key: string;
  value: string;
}

/** Dispatched on `window` whenever cluster labels are changed in this window. */
export const CLUSTER_LABELS_CHANGED_EVENT = 'headlamp-cluster-labels-changed';

const LABEL_NAME_MAX_LENGTH = 63;
const LABEL_PREFIX_MAX_LENGTH = 253;
const LABEL_NAME_REGEX = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const DNS_SUBDOMAIN_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

/**
 * Returns whether a string is a valid Kubernetes label key, e.g. "environment" or
 * "example.com/team".
 */
export function isValidLabelKey(key: string): boolean {
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
    (prefix.length > LABEL_PREFIX_MAX_LENGTH || !DNS_SUBDOMAIN_REGEX.test(prefix))
  ) {
    return false;
  }
  return name.length <= LABEL_NAME_MAX_LENGTH && LABEL_NAME_REGEX.test(name);
}

/** Returns whether a string is a valid Kubernetes label value (empty values are allowed). */
export function isValidLabelValue(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  return value === '' || (value.length <= LABEL_NAME_MAX_LENGTH && LABEL_NAME_REGEX.test(value));
}

/** Returns the keys of labels whose key or value is not valid Kubernetes label syntax. */
export function getInvalidLabelKeys(labels: ClusterLabels): string[] {
  return Object.entries(labels)
    .filter(([key, value]) => !isValidLabelKey(key) || !isValidLabelValue(value))
    .map(([key]) => key);
}

/** Keeps only valid string labels, dropping anything malformed found in storage. */
export function sanitizeClusterLabels(raw: unknown): ClusterLabels {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const labels: ClusterLabels = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && isValidLabelKey(key) && isValidLabelValue(value)) {
      labels[key] = value;
    }
  }
  return labels;
}

/** Loads the sanitized labels for a cluster from its local settings. */
export function loadClusterLabels(clusterName: string): ClusterLabels {
  return sanitizeClusterLabels(loadClusterSettings(clusterName).labels);
}

/** Returns a copy of the settings with the given labels, removing the field when empty. */
export function withClusterLabels(settings: ClusterSettings, labels: ClusterLabels) {
  const next: ClusterSettings = { ...settings };
  if (Object.keys(labels).length > 0) {
    next.labels = { ...labels };
  } else {
    delete next.labels;
  }
  return next;
}

/** Notifies listeners in this window that cluster labels have changed. */
export function notifyClusterLabelsChanged() {
  window.dispatchEvent(new Event(CLUSTER_LABELS_CHANGED_EVENT));
}

/**
 * Stores the labels for a cluster in its local settings, preserving other settings.
 * Throws if any label is not valid Kubernetes label syntax.
 */
export function storeClusterLabels(clusterName: string, labels: ClusterLabels) {
  if (!clusterName) {
    return;
  }
  const invalidKeys = getInvalidLabelKeys(labels);
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid cluster labels: ${invalidKeys.join(', ')}`);
  }
  storeClusterSettings(clusterName, withClusterLabels(loadClusterSettings(clusterName), labels));
  notifyClusterLabelsChanged();
}

/** Formats a label as `key=value`. */
export function formatClusterLabel(key: string, value: string) {
  return `${key}=${value}`;
}

/** Parses a `key=value` string into a filter, or returns null when it is malformed. */
export function parseClusterLabelFilter(text: string): ClusterLabelFilter | null {
  if (typeof text !== 'string') {
    return null;
  }
  const separator = text.indexOf('=');
  if (separator <= 0) {
    return null;
  }
  const key = text.slice(0, separator);
  const value = text.slice(separator + 1);
  if (!isValidLabelKey(key) || !isValidLabelValue(value)) {
    return null;
  }
  return { key, value };
}

/**
 * Returns whether labels satisfy the filters. Like a Kubernetes set-based selector,
 * values for the same key are alternatives (`key in (a, b)`) and different keys must all
 * match (AND).
 */
export function matchesClusterLabelFilters(
  labels: ClusterLabels,
  filters: ClusterLabelFilter[]
): boolean {
  const valuesByKey = new Map<string, Set<string>>();
  for (const { key, value } of filters) {
    if (!valuesByKey.has(key)) {
      valuesByKey.set(key, new Set());
    }
    valuesByKey.get(key)!.add(value);
  }
  for (const [key, values] of valuesByKey) {
    if (!Object.prototype.hasOwnProperty.call(labels, key) || !values.has(labels[key])) {
      return false;
    }
  }
  return true;
}

/** Returns the sorted label keys and `key=value` pairs used across the given clusters. */
export function collectClusterLabelOptions(labelsByCluster: Record<string, ClusterLabels>) {
  const keys = new Set<string>();
  const pairs = new Set<string>();
  for (const labels of Object.values(labelsByCluster)) {
    for (const [key, value] of Object.entries(labels)) {
      keys.add(key);
      pairs.add(formatClusterLabel(key, value));
    }
  }
  const compare = (a: string, b: string) => a.localeCompare(b);
  return { keys: [...keys].sort(compare), pairs: [...pairs].sort(compare) };
}
