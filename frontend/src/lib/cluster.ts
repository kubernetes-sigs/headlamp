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

import { Base64 } from 'js-base64';
import { without } from 'lodash';
import { matchPath } from 'react-router';
import { getBaseUrl } from '../helpers/getBaseUrl';
import { isElectron } from '../helpers/isElectron';

/**
 * @returns A path prefixed with cluster path, and the given path.
 *
 * The given path does not start with a /, it will be added.
 */
export function getClusterPrefixedPath(path?: string | null) {
  const baseClusterPath = '/c/:cluster';
  if (!path) {
    return baseClusterPath;
  }

  return baseClusterPath + (path[0] === '/' ? '' : '/') + path;
}

function decodeClusterPath(encodedCluster: string): string | undefined {
  if (!Base64.isValid(encodedCluster)) {
    return undefined;
  }

  const cluster = Base64.decode(encodedCluster);
  return cluster && Base64.encodeURI(cluster) === encodedCluster ? cluster : undefined;
}

/**
 * Get the currently selected cluster name.
 *
 * If more than one cluster is selected it will return:
 *  - On details pages: the cluster of the currently viewed resource
 *  - On any other page: one of the selected clusters
 *
 * To get all currently selected clusters please use {@link getSelectedClusters}
 *
 * @returns The current cluster name, or null if not in a cluster context.
 */
export function getCluster(urlPath?: string): string | null {
  const clusterString = getClusterPathParam(urlPath);
  if (!clusterString) return null;

  if (clusterString.includes('+')) {
    return clusterString.split('+')[0];
  }
  return clusterString;
}

/** Returns cluster URL parameter from the current path or the given path */
export function getClusterPathParam(maybeUrlPath?: string): string | undefined {
  const prefix = getBaseUrl();
  const urlPath =
    maybeUrlPath ??
    (isElectron()
      ? window.location.hash.substring(1)
      : window.location.pathname.slice(prefix.length));

  const clusterURLMatch = matchPath<{ cluster?: string }>(urlPath, {
    path: getClusterPrefixedPath(),
  });

  if (clusterURLMatch?.params?.cluster) {
    return clusterURLMatch.params.cluster;
  }

  const encodedClusterURLMatch = matchPath<{ encodedCluster?: string }>(urlPath, {
    path: '/encoded-clusters/:encodedCluster/login',
    exact: true,
  });

  return encodedClusterURLMatch?.params?.encodedCluster
    ? decodeClusterPath(encodedClusterURLMatch.params.encodedCluster)
    : undefined;
}

/**
 * Format cluster path URL parameter
 *
 * Cluster parameter contains selected clusters, with the first one being the current one
 * usually used for details pages.
 *
 * @param selectedClusters - list of all selected clusters
 * @param currentCluster - (optional) cluster name of the current cluster
 * @returns formatted cluster parameter
 */
export const formatClusterPathParam = (selectedClusters: string[], currentCluster?: string) =>
  (currentCluster
    ? // Put current cluster as first
      [currentCluster, ...without(selectedClusters, currentCluster)]
    : selectedClusters
  ).join('+');

/**
 * Gets clusters.
 *
 * @param returnWhenNoClusters return this value when no clusters are found.
 * @returns the cluster group from the URL.
 */
export function getClusterGroup(returnWhenNoClusters: string[] = []): string[] {
  return getSelectedClusters(returnWhenNoClusters);
}

/**
 * Get list of selected clusters.
 *
 * @param returnWhenNoClusters return this value when no clusters are found.
 * @param urlPath optional, path string containing cluster parameters.
 * @returns the cluster group from the URL.
 */
export function getSelectedClusters(
  returnWhenNoClusters: string[] = [],
  urlPath?: string
): string[] {
  const clusterFromURL = getClusterPathParam(urlPath);
  return clusterFromURL?.split('+') || returnWhenNoClusters;
}
