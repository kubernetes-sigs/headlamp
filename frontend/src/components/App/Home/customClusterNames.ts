import { useClustersConf } from '../../../lib/k8s';

/**
 * Gets the names of the clusters from the clusters configuration.
 * If the cluster has a custom name, it will be used instead of the default name.
 * The clusters are sorted by their names.
 *
 * @returns An array of name sorted clusters.
 */
export function getCustomClusterNames(clusters: ReturnType<typeof useClustersConf>) {
  if (clusters === null) {
    return [];
  }
  return Object.values(clusters)
    .map(c => ({
      ...c,
      name: c.meta_data?.extensions?.headlamp_info?.customName || c.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
