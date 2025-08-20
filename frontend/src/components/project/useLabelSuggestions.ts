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

import { sortBy } from 'lodash';
import { useMemo } from 'react';
import { ApiError } from '../../lib/k8s/apiProxy';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import { KubeObject } from '../../lib/k8s/KubeObject';
import ReplicaSet from '../../lib/k8s/replicaSet';
import StatefulSet from '../../lib/k8s/statefulSet';

/**
 * APP_LABEL_KEYS is a list of recommended Kubernetes labels to identify an application.
 * Also includes other common labels used for grouping.
 *
 * See https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
 */
const APP_LABEL_KEYS = [
  'app.kubernetes.io/name',
  'app.kubernetes.io/instance',
  'app.kubernetes.io/component',
  'app.kubernetes.io/part-of',
  'app',
  'k8s-app',
  'helm.sh/chart',
  'name',
];

/**
 * getAppName extracts the application name from a Kubernetes resource.
 *
 * It iterates through a predefined list of common application label keys
 * and returns the value of the first one it finds.
 *
 * @param resource The Kubernetes resource to inspect.
 * @returns An object containing the app name and the label key/value pair, or null if no app label is found.
 */
function getAppName(resource: KubeObject): {
  appName: string;
  labelKey: string;
  labelValue: string;
} | null {
  const labels = resource.metadata.labels || {};

  for (const key of APP_LABEL_KEYS) {
    if (labels[key]) {
      return { appName: labels[key], labelKey: key, labelValue: labels[key] };
    }
  }

  return null;
}

/**
 * useLabelSuggestions is a custom hook that suggests label selectors for applications.
 *
 * It fetches deployments, replica sets, stateful sets, and daemon sets from the specified clusters and namespaces.
 * It then extracts application names from the labels of these resources and generates a list of suggested label selectors.
 *
 * @param clusters - A list of cluster names to search for resources.
 * @param namespaces - An optional list of namespaces to search for resources.
 * @returns An object containing the suggested label selectors, a loading state, and any API errors.
 */
export function useLabelSuggestions({
  clusters,
  namespaces,
}: {
  clusters: string[];
  namespaces?: string[];
}) {
  const {
    items: deployments,
    error: deploymentsError,
    isLoading: deploymentsLoading,
  } = Deployment.useList({
    clusters,
    namespace: namespaces,
    refetchInterval: 60_000,
  });
  const {
    items: replicaSets,
    error: replicaSetsError,
    isLoading: replicaSetsLoading,
  } = ReplicaSet.useList({
    clusters,
    namespace: namespaces,
    refetchInterval: 60_000,
  });
  const {
    items: statefulSets,
    error: statefulSetsError,
    isLoading: statefulSetsLoading,
  } = StatefulSet.useList({
    clusters,
    namespace: namespaces,
    refetchInterval: 60_000,
  });
  const {
    items: daemonSets,
    error: daemonSetsError,
    isLoading: daemonSetsLoading,
  } = DaemonSet.useList({
    clusters,
    namespace: namespaces,
    refetchInterval: 60_000,
  });

  const suggestedSelectors = useMemo(() => {
    const allResources = [
      ...(deployments || []),
      ...(replicaSets || []),
      ...(statefulSets || []),
      ...(daemonSets || []),
    ];

    const appMap = new Map<
      string,
      { labelKey: string; labelValue: string; resources: KubeObject[] }
    >();

    for (const resource of allResources) {
      const appInfo = getAppName(resource);
      if (appInfo) {
        const { appName, labelKey, labelValue } = appInfo;
        if (!appMap.has(appName)) {
          appMap.set(appName, { labelKey, labelValue, resources: [] });
        }
        appMap.get(appName)?.resources.push(resource);
      }
    }

    const suggestions: { label: string; value: string }[] = [];
    for (const [, { labelKey, labelValue }] of appMap.entries()) {
      suggestions.push({
        label: labelKey,
        value: labelValue,
      });
    }

    return sortBy(suggestions, it => it.value);
  }, [deployments, replicaSets, statefulSets, daemonSets]);

  const isLoading =
    deploymentsLoading || replicaSetsLoading || statefulSetsLoading || daemonSetsLoading;
  const errors = useMemo(
    () =>
      [deploymentsError, replicaSetsError, statefulSetsError, daemonSetsError].filter(
        Boolean
      ) as ApiError[],
    [deploymentsError, replicaSetsError, statefulSetsError, daemonSetsError]
  );

  return { suggestions: suggestedSelectors, isLoading, errors };
}
