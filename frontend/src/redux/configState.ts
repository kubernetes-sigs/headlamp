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

export interface ConfigState {
  /**
   * Clusters is a map of cluster names to cluster objects.
   * Null indicates that the clusters have not been loaded yet.
   */
  clusters: {
    [clusterName: string]: Cluster;
  } | null;
  /**
   * Stateless Clusters is a map of cluster names to cluster objects.
   * Null indicates that the clusters have not been loaded yet.
   */
  statelessClusters: {
    [clusterName: string]: Cluster;
  } | null;

  /**
   * All Clusters is a map of cluster names to cluster objects.
   * They are comination of clusters and statelessClusters.
   * Null indicates that the clusters have not been loaded yet.
   */
  allClusters: {
    [clusterName: string]: Cluster;
  } | null;
  /**
   * Settings is a map of settings names to settings values.
   */
  settings: {
    /**
     * tableRowsPerPageOptions is the list of options for the number of rows per page in a table.
     */
    tableRowsPerPageOptions: number[];
    /**
     * timezone is the timezone to use for displaying dates and times.
     */
    timezone: string;
    useEvict: boolean;
    [key: string]: any;
  };
}
