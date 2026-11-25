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
  loadClusterSettings,
  loadResolvedAllowedNamespaces,
  subscribeToClusterSettings,
} from '../../helpers/clusterSettings';
import { useAllowedNamespacesFromSelector } from '../../lib/k8s/allowedNamespaces';
import {
  AllowedNamespacesResolutionContext,
  AllowedNamespacesSelectorContext,
} from '../../lib/k8s/allowedNamespacesContext';
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
  const [resolutions, setResolutions] = useState<Record<string, SelectorResolution>>({});
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
  // On-demand clusters must not unmount the route that registered them.
  const waiting = clusters.some(cluster => resolutionKeys[cluster] === null);
  const resolutionKey = JSON.stringify([settingsKey, resolutionKeys]);
  const selectorContext = useMemo(() => ({ registerCluster, waiting }), [registerCluster, waiting]);

  return (
    <AllowedNamespacesSelectorContext.Provider value={selectorContext}>
      {allClusters.map(cluster => (
        <AllowedNamespacesSelectorResolver
          key={cluster}
          cluster={cluster}
          onResolved={onResolved}
        />
      ))}
      <AllowedNamespacesResolutionContext.Provider value={resolutionKey}>
        {children}
      </AllowedNamespacesResolutionContext.Provider>
    </AllowedNamespacesSelectorContext.Provider>
  );
}

/** Gates the initial route render, then preserves mounted content during selector refresh. */
export default function AllowedNamespacesSelectorGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const waiting = useContext(AllowedNamespacesSelectorContext)?.waiting ?? false;
  const [hasRenderedContent, setHasRenderedContent] = useState(!waiting);
  if (!waiting && !hasRenderedContent) {
    setHasRenderedContent(true);
  }
  return waiting && !hasRenderedContent ? <Loader title={t('Loading')} /> : <>{children}</>;
}
