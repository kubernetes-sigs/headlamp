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

import {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  getDiscoveryGeneration,
  loadClusterSettings,
  loadResolvedAllowedNamespaces,
  subscribeDiscoveredNamespaces,
  subscribeToClusterSettings,
} from '../../helpers/clusterSettings';
import {
  shouldDiscoverNamespaces,
  useAccessibleNamespaces,
} from '../../lib/k8s/accessibleNamespaces';
import { useAllowedNamespacesFromSelector } from '../../lib/k8s/allowedNamespaces';
import {
  AllowedNamespacesResolutionContext,
  AllowedNamespacesSelectorContext,
} from '../../lib/k8s/allowedNamespacesContext';
import { useTypedSelector } from '../../redux/hooks';
import { Loader } from '../common';

/** Result state for a single allowed namespace selector. */
interface SelectorResolution {
  /** Selector associated with the result. */
  selector: string;
  /** Stable key for the selector result or error. */
  resultKey: string;
  /** Whether selector resolution failed. */
  isError: boolean;
}

interface DiscoveryResolution {
  generation: number;
  resultKey: string | null;
}

/**
 * Resolves one cluster's namespace selector and reports stable result changes.
 *
 * @param props - Cluster and result callback.
 * @returns No rendered content.
 */
function AllowedNamespacesSelectorResolver({
  cluster,
  onResolved,
}: {
  cluster: string;
  onResolved: (cluster: string, resolution: SelectorResolution) => void;
}) {
  const selector = (loadClusterSettings(cluster).allowedNamespacesSelector || '').trim();
  const resolution = useAllowedNamespacesFromSelector(cluster, selector);
  const resultKey = resolution.error
    ? JSON.stringify([selector, 'error', resolution.error.message])
    : resolution.isSuccess
    ? JSON.stringify([selector, 'success', resolution.namespaces])
    : '';

  useEffect(() => {
    if (selector && resultKey) {
      onResolved(cluster, { selector, resultKey, isError: Boolean(resolution.error) });
    }
  }, [cluster, selector, resultKey, resolution.error, onResolved]);

  return null;
}

/**
 * Discovers one cluster's accessible namespaces and reports stable result changes.
 * The hook updates the discovered-namespaces store before this component's
 * effect reports the result, so children never render with a stale store.
 *
 * @param props - Cluster and result callback.
 * @returns No rendered content.
 */
function AccessibleNamespacesResolver({
  cluster,
  generation,
  onDiscovered,
}: {
  cluster: string;
  generation: number;
  onDiscovered: (cluster: string, generation: number, resultKey: string | null) => void;
}) {
  const { isPending, namespaces } = useAccessibleNamespaces(cluster);
  const resultKey = isPending ? null : JSON.stringify(namespaces ?? null);

  // Report pending (null) too: after a login or token change discovery starts
  // over, and dependent routes must wait for the new identity's result.
  useEffect(() => {
    onDiscovered(cluster, generation, resultKey);
  }, [cluster, generation, resultKey, onDiscovered]);

  return null;
}

/**
 * Shares selector resolution with routes, panels and drawers. List consumers can
 * also register request clusters that are not part of the current selection.
 *
 * @param props - Relevant clusters and selector-dependent content.
 * @returns Selector resolvers and the subscribed child content.
 */
export function AllowedNamespacesSelectorProvider({
  clusters,
  children,
}: {
  clusters: string[];
  children: ReactNode;
}) {
  const discoveryEnabled = useTypedSelector(state => state.config.namespaceDiscoveryEnabled);
  const discoveryGeneration = useSyncExternalStore(
    subscribeDiscoveredNamespaces,
    getDiscoveryGeneration,
    getDiscoveryGeneration
  );
  const [resolutions, setResolutions] = useState<Record<string, SelectorResolution>>({});
  const [discovered, setDiscovered] = useState<Record<string, DiscoveryResolution>>({});
  const [requestedClusters, setRequestedClusters] = useState<Record<string, number>>({});
  const registerCluster = useCallback((cluster: string) => {
    setRequestedClusters(current => {
      const count = Object.prototype.hasOwnProperty.call(current, cluster) ? current[cluster] : 0;
      return { ...current, [cluster]: count + 1 };
    });
    return () => {
      setRequestedClusters(current => {
        const next = { ...current };
        if (next[cluster] === 1) {
          delete next[cluster];
        } else {
          next[cluster] -= 1;
        }
        return next;
      });
    };
  }, []);
  const onDiscovered = useCallback(
    (cluster: string, generation: number, resultKey: string | null) => {
      setDiscovered(current =>
        current[cluster]?.generation === generation && current[cluster]?.resultKey === resultKey
          ? current
          : { ...current, [cluster]: { generation, resultKey } }
      );
    },
    []
  );
  const onResolved = useCallback((cluster: string, resolution: SelectorResolution) => {
    setResolutions(current =>
      current[cluster]?.resultKey === resolution.resultKey
        ? current
        : { ...current, [cluster]: resolution }
    );
  }, []);

  const allClusters = [...new Set([...clusters, ...Object.keys(requestedClusters)])].sort();
  const getSettingsSnapshot = () =>
    JSON.stringify(
      allClusters.map(cluster => {
        const settings = loadClusterSettings(cluster);
        const selector = settings.allowedNamespacesSelector?.trim() || '';
        const cache = selector ? loadResolvedAllowedNamespaces(cluster) : null;
        return [
          cluster,
          settings.allowedNamespaces || [],
          selector,
          cache?.selector === selector ? cache.namespaces : null,
        ];
      })
    );
  const settingsKey = useSyncExternalStore(
    subscribeToClusterSettings,
    getSettingsSnapshot,
    getSettingsSnapshot
  );
  const resolutionKeys = Object.fromEntries(
    allClusters.map((cluster): [string, string | null] => {
      const selector = (loadClusterSettings(cluster).allowedNamespacesSelector || '').trim();
      const cache = selector ? loadResolvedAllowedNamespaces(cluster) : null;
      const cachedResultKey =
        cache?.selector === selector ? JSON.stringify([selector, 'success', cache.namespaces]) : '';
      const resolution = resolutions[cluster];

      if (!selector || cachedResultKey) {
        return [cluster, cachedResultKey];
      }

      return [
        cluster,
        resolution?.selector === selector && resolution.isError ? resolution.resultKey : null,
      ];
    })
  );
  const discoveryKeys = Object.fromEntries(
    allClusters.map((cluster): [string, string | null] => [
      cluster,
      shouldDiscoverNamespaces(cluster, discoveryEnabled)
        ? discovered[cluster]?.generation === discoveryGeneration
          ? discovered[cluster].resultKey
          : null
        : '',
    ])
  );
  // On-demand clusters must not unmount the route that registered them.
  const selectorWaiting = clusters.some(cluster => resolutionKeys[cluster] === null);
  // Unlike selector refreshes, a new identity must never see content built for the previous one.
  const discoveryWaiting = clusters.some(cluster => discoveryKeys[cluster] === null);
  const waiting = selectorWaiting || discoveryWaiting;
  const resolutionKey = JSON.stringify([settingsKey, resolutionKeys, discoveryKeys]);
  const selectorContext = useMemo(
    () => ({ registerCluster, waiting, discoveryWaiting }),
    [registerCluster, waiting, discoveryWaiting]
  );

  return (
    <AllowedNamespacesSelectorContext.Provider value={selectorContext}>
      {allClusters.map(cluster => (
        <AllowedNamespacesSelectorResolver
          key={cluster}
          cluster={cluster}
          onResolved={onResolved}
        />
      ))}
      {allClusters.map(cluster => (
        <AccessibleNamespacesResolver
          key={cluster}
          cluster={cluster}
          generation={discoveryGeneration}
          onDiscovered={onDiscovered}
        />
      ))}
      <AllowedNamespacesResolutionContext.Provider value={resolutionKey}>
        {children}
      </AllowedNamespacesResolutionContext.Provider>
    </AllowedNamespacesSelectorContext.Provider>
  );
}

/**
 * Gates the initial route render, then preserves mounted content during selector refresh.
 * Namespace discovery for a new identity always holds content back.
 */
export default function AllowedNamespacesSelectorGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const selectorContext = useContext(AllowedNamespacesSelectorContext);
  const waiting = selectorContext?.waiting ?? false;
  const discoveryWaiting = selectorContext?.discoveryWaiting ?? false;
  const [hasRenderedContent, setHasRenderedContent] = useState(!waiting);
  if (!waiting && !hasRenderedContent) {
    setHasRenderedContent(true);
  }
  return (waiting && !hasRenderedContent) || discoveryWaiting ? (
    <Loader title={t('Loading')} />
  ) : (
    <>{children}</>
  );
}
