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

import * as yaml from 'js-yaml';

interface Cluster {
  name: string;
  cluster: {
    server: string;
    [key: string]: any;
  };
}

interface User {
  name: string;
  user: {
    token: string;
    [key: string]: any;
  };
}

export interface Kubeconfig {
  clusters: Cluster[];
  users: User[];
  contexts: { name: string; context: { cluster: string; user: string } }[];
  currentContext: string;
}

/**
 * Returns the subset of `config` containing only the entries referenced by the
 * given context names (the contexts themselves plus the clusters and users they
 * point at).
 *
 * @param config The full parsed kubeconfig.
 * @param selectedClusters The context names that were selected for import.
 */
export function configWithSelectedClusters(
  config: Kubeconfig,
  selectedClusters: string[]
): Kubeconfig {
  const newConfig: Kubeconfig = {
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  };

  // We use a map to avoid duplicates since many contexts can point to the same cluster/user.
  const clusters: { [key: string]: Cluster } = {};
  const users: { [key: string]: User } = {};

  selectedClusters.forEach(clusterName => {
    const context = config.contexts.find(c => c.name === clusterName);
    if (!context) {
      return;
    }

    const cluster = config.clusters.find(c => c.name === context.context.cluster);
    if (!cluster) {
      return;
    }
    clusters[cluster.name] = cluster;

    // Optionally add the user.
    const user = config.users?.find(c => c.name === context.context.user);
    if (!!user) {
      users[user.name] = user;
    }

    newConfig.contexts.push(context);
  });

  newConfig.clusters = Object.values(clusters);
  newConfig.users = Object.values(users);

  return newConfig;
}

/**
 * Builds a portable kubeconfig YAML (apiVersion/kind/current-context included)
 * scoped to only the selected contexts, suitable for handing off to kubectl or
 * another tool.
 *
 * @param config The full parsed kubeconfig.
 * @param selectedClusters The context names that were selected for import.
 */
export function buildExportKubeconfigYaml(config: Kubeconfig, selectedClusters: string[]): string {
  const filtered = configWithSelectedClusters(config, selectedClusters);
  // Prefer the first selected context that survived filtering; fall back to the
  // first retained context so the exported file always has an active context.
  const currentContext =
    selectedClusters.find(name => filtered.contexts.some(c => c.name === name)) ??
    filtered.contexts[0]?.name ??
    '';

  return yaml.dump({
    apiVersion: 'v1',
    kind: 'Config',
    preferences: {},
    clusters: filtered.clusters,
    users: filtered.users,
    contexts: filtered.contexts,
    'current-context': currentContext,
  });
}
