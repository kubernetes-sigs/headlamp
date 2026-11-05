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

export interface ClusterSourceView {
  id: string;
  label: string;
  nameLabel: string;
  columns?: { key: string; label: string }[];
  detailFields?: { key: string; label: string }[];
  summaryFields?: string[];
  configured?: boolean;
}

export interface ConnectionPresentation {
  displayName: string;
  fields: Record<string, string>;
}

export interface ClusterLabel {
  name: string;
  secondary: string;
  disambiguator: string;
  text: string;
}

export const EMPTY_SOURCE_VIEWS: ClusterSourceView[] = [];

export function hasConfiguredClusterSources(sources: ClusterSourceView[] = EMPTY_SOURCE_VIEWS) {
  return sources.some(source => source.configured);
}

type TranslateLabel = (label: string) => string;

const labelTranslations = new Map<string, (t: TranslateLabel) => string>([
  ['Kubeconfig', t => t('Kubeconfig')],
  ['In-cluster', t => t('In-cluster')],
  ['Plugin', t => t('Plugin')],
  ['Cluster Inventory API', t => t('Cluster Inventory API')],
  ['Cluster API', t => t('Cluster API')],
  ['Unknown', t => t('Unknown')],
  ['Context', t => t('Context')],
  ['Context namespace', t => t('Context namespace')],
  ['Kubeconfig file', t => t('Kubeconfig file')],
  ['Cluster', t => t('Cluster')],
  ['ClusterProfile', t => t('ClusterProfile')],
  ['Resource namespace', t => t('Resource namespace')],
  ['Access provider', t => t('Access provider')],
  ['Kubeconfig Secret', t => t('Kubeconfig Secret')],
  ['Management context', t => t('Management context')],
  ['Name', t => t('Name')],
]);

export function translateClusterLabel(label: string, t: TranslateLabel): string {
  return labelTranslations.get(label)?.(t) ?? t(label);
}

const legacyLabels: Record<string, string> = {
  kubeconfig: 'Kubeconfig',
  incluster: 'In-cluster',
  dynamic_cluster: 'Plugin',
  cluster_inventory: 'Cluster Inventory API',
  cluster_api: 'Cluster API',
  unknown: 'Unknown',
};

export function getClusterDisplayName(cluster: Cluster): string {
  return (
    cluster.meta_data?.extensions?.headlamp_info?.customName ||
    cluster.meta_data?.presentation?.displayName ||
    cluster.name
  );
}

export function getClusterSource(cluster: Cluster): string {
  return cluster.meta_data?.source || 'unknown';
}

export function getClusterSourceLabel(cluster: Cluster, sources: ClusterSourceView[] = []): string {
  return resolveSourceLabel(
    cluster,
    sources.find(view => view.id === getClusterSource(cluster))
  );
}

function resolveSourceLabel(cluster: Cluster, view?: ClusterSourceView): string {
  const source = getClusterSource(cluster);
  return (
    view?.label ||
    (source === 'cluster_inventory' ? legacyLabels[source] : cluster.meta_data?.sourceLabel) ||
    legacyLabels[source] ||
    source
  );
}

export function getClusterField(cluster: Cluster, key: string): string {
  const value = cluster.meta_data?.presentation?.fields?.[key];
  return typeof value === 'string' ? value : '';
}

/** Source definitions with no connections stay visible when discovery is configured. */
export function getClusterSourceViews(
  clusters: Cluster[],
  sources: ClusterSourceView[]
): ClusterSourceView[] {
  const observed = new Map(clusters.map(cluster => [getClusterSource(cluster), cluster]));
  const views = sources.filter(view => view.configured || observed.has(view.id));
  for (const [id, cluster] of observed) {
    if (!views.some(view => view.id === id)) {
      views.push({ id, label: getClusterSourceLabel(cluster, sources), nameLabel: 'Name' });
    }
  }
  return views;
}

export function getClusterSearchText(cluster: Cluster, sources: ClusterSourceView[] = []): string {
  return [
    cluster.name,
    getClusterDisplayName(cluster),
    getClusterSourceLabel(cluster, sources),
    ...Object.values(cluster.meta_data?.presentation?.fields || {}),
  ].join(' ');
}

/** Index duplicate groups once, keeping individual label lookups independent of list size. */
export function createClusterPresentation(
  clusters: Cluster[],
  sources: ClusterSourceView[] = EMPTY_SOURCE_VIEWS,
  translate: (label: string) => string = label => label
) {
  const sourceByID = new Map(sources.map(source => [source.id, source]));
  const groups = new Map<string, { count: number; roots: Map<string, number> }>();
  const entryFor = (cluster: Cluster) => {
    const name = getClusterDisplayName(cluster);
    const view = sourceByID.get(getClusterSource(cluster));
    const summary = cluster.meta_data?.presentation
      ? [
          translateClusterLabel(resolveSourceLabel(cluster, view), translate),
          ...(view?.summaryFields || []).map(key => getClusterField(cluster, key)),
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
    return {
      cluster,
      name,
      summary,
      base: [name, summary].filter(Boolean).join(' · '),
      root: getClusterField(cluster, 'root'),
    };
  };
  const entries = clusters.map(entryFor);
  for (const { base, root } of entries) {
    const group = groups.get(base) || { count: 0, roots: new Map<string, number>() };
    group.count++;
    group.roots.set(root, (group.roots.get(root) || 0) + 1);
    groups.set(base, group);
  }
  const labelFor = ({
    cluster,
    name,
    summary,
    base,
    root,
  }: ReturnType<typeof entryFor>): ClusterLabel => {
    const group = groups.get(base);
    let secondary = summary;
    let disambiguator = '';
    if (group && group.count > 1) {
      disambiguator = root;
      secondary = [secondary, root].filter(Boolean).join(' · ');
      if ((group.roots.get(root) || 0) > 1) {
        disambiguator = [root, cluster.name].filter(Boolean).join(' · ');
        secondary = [secondary, cluster.name].filter(Boolean).join(' · ');
      }
    }
    return { name, secondary, disambiguator, text: [name, secondary].filter(Boolean).join(' · ') };
  };
  const labels = new Map(entries.map(entry => [entry.cluster.name, labelFor(entry)]));
  return {
    getLabel: (cluster: Cluster | string): ClusterLabel => {
      const id = typeof cluster === 'string' ? cluster : cluster.name;
      return (
        labels.get(id) ||
        labelFor(entryFor(typeof cluster === 'string' ? { name: id, auth_type: '' } : cluster))
      );
    },
  };
}
