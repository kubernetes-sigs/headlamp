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

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadClusterSettings, loadResolvedAllowedNamespaces } from '../../helpers/clusterSettings';
import {
  shouldDiscoverNamespaces,
  useAccessibleNamespaces,
} from '../../lib/k8s/accessibleNamespaces';
import { useAllowedNamespacesFromSelector } from '../../lib/k8s/allowedNamespaces';
import { AllowedNamespacesResolutionContext } from '../../lib/k8s/allowedNamespacesContext';
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
  onDiscovered,
}: {
  cluster: string;
  onDiscovered: (cluster: string, resultKey: string | null) => void;
}) {
  const { isPending, namespaces } = useAccessibleNamespaces(cluster);
  const resultKey = isPending ? null : JSON.stringify(namespaces ?? null);

  // Report pending (null) too: after a login or token change discovery starts
  // over, and dependent routes must wait for the new identity's result.
  useEffect(() => {
    onDiscovered(cluster, resultKey);
  }, [cluster, resultKey, onDiscovered]);

  return null;
}

/**
 * Delays child rendering until every relevant namespace selector and namespace
 * discovery has resolved.
 *
 * @param props - Relevant clusters and selector-dependent content.
 * @returns Selector resolvers followed by a loader or the child content.
 */
export default function AllowedNamespacesSelectorGate({
  clusters,
  children,
}: {
  clusters: string[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const discoveryEnabled = useTypedSelector(state => state.config.namespaceDiscoveryEnabled);
  const [resolutions, setResolutions] = useState<Record<string, SelectorResolution>>({});
  const [discovered, setDiscovered] = useState<Record<string, string | null>>({});
  const onDiscovered = useCallback((cluster: string, resultKey: string | null) => {
    setDiscovered(current =>
      current[cluster] === resultKey ? current : { ...current, [cluster]: resultKey }
    );
  }, []);
  const onResolved = useCallback((cluster: string, resolution: SelectorResolution) => {
    setResolutions(current =>
      current[cluster]?.resultKey === resolution.resultKey
        ? current
        : { ...current, [cluster]: resolution }
    );
  }, []);

  const resolutionKeys = clusters.map(cluster => {
    const selector = (loadClusterSettings(cluster).allowedNamespacesSelector || '').trim();
    const cache = selector ? loadResolvedAllowedNamespaces(cluster) : null;
    const cachedResultKey =
      cache?.selector === selector ? JSON.stringify([selector, 'success', cache.namespaces]) : '';
    const resolution = resolutions[cluster];

    if (!selector || cachedResultKey) {
      return cachedResultKey;
    }

    return resolution?.selector === selector && resolution.isError ? resolution.resultKey : null;
  });
  const discoveryKeys = clusters.map(cluster =>
    shouldDiscoverNamespaces(cluster, discoveryEnabled) ? discovered[cluster] ?? null : ''
  );
  const waiting = [...resolutionKeys, ...discoveryKeys].some(key => key === null);
  const resolutionKey = JSON.stringify([resolutionKeys, discoveryKeys]);

  return (
    <>
      {clusters.map(cluster => (
        <AllowedNamespacesSelectorResolver
          key={cluster}
          cluster={cluster}
          onResolved={onResolved}
        />
      ))}
      {clusters.map(cluster => (
        <AccessibleNamespacesResolver key={cluster} cluster={cluster} onDiscovered={onDiscovered} />
      ))}
      {waiting ? (
        <Loader title={t('Loading')} />
      ) : (
        <AllowedNamespacesResolutionContext.Provider value={resolutionKey}>
          {children}
        </AllowedNamespacesResolutionContext.Provider>
      )}
    </>
  );
}
