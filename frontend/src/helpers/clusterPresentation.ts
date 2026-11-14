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

/**
 * Describes one cluster source, such as kubeconfig files or a discovery source, so that
 * its tab, columns and details are rendered without source-specific code. The backend
 * sends these definitions as `clusterSources` in `/config`.
 */
export interface ClusterSourceView {
  /** Source ID, matched against the `meta_data.source` of each connection. */
  id: string;
  /** Untranslated name of the source, shown as its tab title. */
  label: string;
  /** Untranslated header of the name column on the source's tab, for example `Context`. */
  nameLabel: string;
  /**
   * Columns added to the source's tab and to the connection details. `key` selects the
   * value from `meta_data.presentation.fields` and `label` is the untranslated header.
   */
  columns?: { key: string; label: string }[];
  /** Fields shown only in the connection details, in the same shape as `columns`. */
  detailFields?: { key: string; label: string }[];
  /** Keys of the presentation fields shown after the source label in cluster selectors. */
  summaryFields?: string[];
  /** Whether this is an enabled discovery source, which keeps its tab without connections. */
  configured?: boolean;
}

/** Human-readable labels of a connection, separate from its connection key. */
export interface ConnectionPresentation {
  /** Name shown for the connection unless the user gave it a custom name. */
  displayName: string;
  /**
   * Public text values by field key, such as `namespace`, `root` for the management
   * context, and the column keys of the connection's source. The backend never puts
   * credentials here.
   */
  fields: Record<string, string>;
}

/** The label of one connection, as resolved by {@link createClusterPresentation}. */
export interface ClusterLabel {
  /** Display name of the connection. */
  name: string;
  /**
   * Line shown with the name: the source label and summary fields, followed by the
   * disambiguator. Empty for a connection without presentation data and a unique name.
   */
  secondary: string;
  /**
   * What tells the connection apart when another one has the same name and summary: its
   * management context, followed by its connection key if that is shared too. Empty for
   * a unique label.
   */
  disambiguator: string;
  /** `name` and `secondary` joined into one line. */
  text: string;
}

/** Shared empty list, so that defaults keep the same reference between renders. */
export const EMPTY_SOURCE_VIEWS: ClusterSourceView[] = [];

/**
 * Checks whether a discovery source is enabled on the backend.
 *
 * @param sources - Source definitions from the backend config.
 * @returns True if at least one source is configured.
 */
export function hasConfiguredClusterSources(sources: ClusterSourceView[] = EMPTY_SOURCE_VIEWS) {
  return sources.some(source => source.configured);
}

/** Translates a label, like the `t` function of i18next. */
type TranslateLabel = (label: string) => string;

/**
 * Labels the backend sends untranslated. Each one is passed to `t` as a string literal,
 * so that the i18n extraction finds it.
 */
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

/**
 * Translates a label sent by the backend, such as a source name or a column header.
 *
 * @param label - The untranslated label.
 * @param t - The translation function to use.
 * @returns The translation, or the result of `t` for a label that is not listed here.
 */
export function translateClusterLabel(label: string, t: TranslateLabel): string {
  return labelTranslations.get(label)?.(t) ?? t(label);
}

/** Source labels by source ID, for servers that do not send source definitions. */
const legacyLabels: Record<string, string> = {
  kubeconfig: 'Kubeconfig',
  incluster: 'In-cluster',
  dynamic_cluster: 'Plugin',
  cluster_inventory: 'Cluster Inventory API',
  cluster_api: 'Cluster API',
  unknown: 'Unknown',
};

/**
 * Gets the name to show for a connection.
 *
 * @param cluster - The connection.
 * @returns The custom name if the user set one, otherwise the display name from the
 * backend, otherwise the connection key.
 */
export function getClusterDisplayName(cluster: Cluster): string {
  return (
    cluster.meta_data?.extensions?.headlamp_info?.customName ||
    cluster.meta_data?.presentation?.displayName ||
    cluster.name
  );
}

/**
 * Gets the ID of the source a connection comes from.
 *
 * @param cluster - The connection.
 * @returns The source ID, or `unknown` if the backend did not send one.
 */
export function getClusterSource(cluster: Cluster): string {
  return cluster.meta_data?.source || 'unknown';
}

/**
 * Gets the untranslated name of the source a connection comes from.
 *
 * @param cluster - The connection.
 * @param sources - Source definitions from the backend config.
 * @returns The label of the connection's source definition, otherwise a label derived
 * from the connection itself.
 */
export function getClusterSourceLabel(cluster: Cluster, sources: ClusterSourceView[] = []): string {
  return resolveSourceLabel(
    cluster,
    sources.find(view => view.id === getClusterSource(cluster))
  );
}

/**
 * Resolves the untranslated source label of a connection.
 *
 * @param cluster - The connection.
 * @param view - The source definition of the connection, if the backend sent one.
 * @returns The first one available of: the label of the definition, the label sent with
 * the connection, the built-in label for the source ID, and the source ID itself.
 * Cluster Inventory connections skip the label sent with the connection.
 */
function resolveSourceLabel(cluster: Cluster, view?: ClusterSourceView): string {
  const source = getClusterSource(cluster);
  return (
    view?.label ||
    (source === 'cluster_inventory' ? legacyLabels[source] : cluster.meta_data?.sourceLabel) ||
    legacyLabels[source] ||
    source
  );
}

/**
 * Gets a presentation field of a connection.
 *
 * @param cluster - The connection.
 * @param key - The field key, such as a column key of the connection's source.
 * @returns The field value, or an empty string if it is missing or not a string.
 */
export function getClusterField(cluster: Cluster, key: string): string {
  const value = cluster.meta_data?.presentation?.fields?.[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Gets the sources to offer as tabs. Source definitions with no connections stay visible
 * when discovery is configured.
 *
 * @param clusters - The connections to look for sources in.
 * @param sources - Source definitions from the backend config.
 * @returns The definitions that are configured or have connections, followed by a
 * generated definition for each source that is only named by a connection.
 */
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

/**
 * Builds the text a connection is matched against when searching.
 *
 * @param cluster - The connection.
 * @param sources - Source definitions from the backend config.
 * @returns The connection key, display name, untranslated source label and presentation
 * field values, separated by spaces.
 */
export function getClusterSearchText(cluster: Cluster, sources: ClusterSourceView[] = []): string {
  return [
    cluster.name,
    getClusterDisplayName(cluster),
    getClusterSourceLabel(cluster, sources),
    ...Object.values(cluster.meta_data?.presentation?.fields || {}),
  ].join(' ');
}

/**
 * Creates a lookup for the labels of connections. Duplicate groups are indexed once,
 * keeping individual label lookups independent of list size.
 *
 * @param clusters - All connections, which are compared to find identical labels.
 * @param sources - Source definitions from the backend config.
 * @param translate - Translates source labels. Leaves them untranslated by default.
 * @returns An object whose `getLabel` returns the label of a connection, given the
 * connection or its key. A key that is not among `clusters` is labelled with the key.
 */
export function createClusterPresentation(
  clusters: Cluster[],
  sources: ClusterSourceView[] = EMPTY_SOURCE_VIEWS,
  translate: (label: string) => string = label => label
) {
  const sourceByID = new Map(sources.map(source => [source.id, source]));
  const groups = new Map<string, { count: number; roots: Map<string, number> }>();
  // The parts of a label that do not depend on the other connections.
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
  // Adds the management context, then the connection key, while the label is still shared.
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
