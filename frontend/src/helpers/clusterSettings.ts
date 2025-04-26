/**
 * ClusterSettings defines the structure of the cluster settings object.
 */
export interface ClusterSettings {
  /** Optional default namespace to be used */
  defaultNamespace?: string;
  /** Only allow namespaces in this list to be selected */
  allowedNamespaces?: string[];
  /** This is a custom cluster name. If it is '' it is the actual cluster name. */
  currentName?: string;
}

/**
 * Stores the cluster settings in local storage.
 *
 * @param clusterName - The name of the cluster.
 * @param settings - The cluster settings to be stored.
 * @returns {void}
 */
export function storeClusterSettings(clusterName: string, settings: ClusterSettings) {
  if (!clusterName) {
    return;
  }
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
}

/**
 * Loads the cluster settings from local storage.
 *
 * @param clusterName - The name of the cluster.
 * @returns {ClusterSettings} - The cluster settings.
 */
export function loadClusterSettings(clusterName: string): ClusterSettings {
  if (!clusterName) {
    return {};
  }
  const settings = JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}');
  return settings;
}
