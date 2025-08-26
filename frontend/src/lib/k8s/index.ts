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

import _ from 'lodash';
import React, { useContext, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { ConfigState } from '../../redux/configSlice';
import { useTypedSelector } from '../../redux/hooks';
import { getCluster, getSelectedClusters } from '../cluster';
import { ApiError, clusterRequest } from './apiProxy';
import { Cluster, LabelSelector, StringDict } from './cluster';
import ClusterRole from './clusterRole';
import ClusterRoleBinding from './clusterRoleBinding';
import ConfigMap from './configMap';
import CustomResourceDefinition from './crd';
import CronJob from './cronJob';
import DaemonSet from './daemonSet';
import Deployment from './deployment';
import Endpoints from './endpoints';
import Gateway from './gateway';
import GatewayClass from './gatewayClass';
import GRPCRoute from './grpcRoute';
import HPA from './hpa';
import HTTPRoute from './httpRoute';
import Ingress from './ingress';
import IngressClass from './ingressClass';
import Job from './job';
import { Lease } from './lease';
import { LimitRange } from './limitRange';
import Namespace from './namespace';
import NetworkPolicy from './networkpolicy';
import Node from './node';
import PersistentVolume from './persistentVolume';
import PersistentVolumeClaim from './persistentVolumeClaim';
import Pod from './pod';
import PodDisruptionBudget from './podDisruptionBudget';
import PriorityClass from './priorityClass';
import ReplicaSet from './replicaSet';
import ResourceQuota from './resourceQuota';
import Role from './role';
import RoleBinding from './roleBinding';
import { RuntimeClass } from './runtime';
import Secret from './secret';
import { SelectedClustersContext } from './SelectedClustersContext';
import Service from './service';
import ServiceAccount from './serviceAccount';
import StatefulSet from './statefulSet';
import StorageClass from './storageClass';

export const ResourceClasses = {
  ClusterRole,
  ClusterRoleBinding,
  ConfigMap,
  CustomResourceDefinition,
  CronJob,
  DaemonSet,
  Deployment,
  Endpoint: Endpoints,
  Endpoints,
  LimitRange,
  Lease,
  ResourceQuota,
  HorizontalPodAutoscaler: HPA,
  PodDisruptionBudget,
  PriorityClass,
  Ingress,
  IngressClass,
  Job,
  Namespace,
  NetworkPolicy,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  Role,
  RoleBinding,
  RuntimeClass,
  Secret,
  Service,
  ServiceAccount,
  StatefulSet,
  StorageClass,
  Gateway,
  GatewayClass,
  HTTPRoute,
  GRPCRoute,
};

/** Hook for getting or fetching the clusters configuration.
 * This gets the clusters from the redux store. The redux store is updated
 * when the user changes the configuration. The configuration is stored in
 * the local storage. When stateless clusters are present, it combines the
 * stateless clusters with the clusters from the redux store.
 * @returns the clusters configuration.
 * */
export function useClustersConf(): ConfigState['allClusters'] {
  const state = useTypedSelector(state => state.config);
  const clusters = _.cloneDeep(state.clusters || {});
  const allClusters = _.cloneDeep(state.allClusters || {});
  Object.assign(allClusters, clusters);

  if (state.statelessClusters) {
    // Combine statelessClusters with clusters
    const statelessClusters = _.cloneDeep(state.statelessClusters || {});
    Object.assign(allClusters, statelessClusters);
  }

  return useMemo(() => allClusters, [Object.keys(allClusters).join(',')]);
}

/**
 * Get the currently selected cluster name.
 *
 * If more than one cluster is selected it will return:
 *  - On details pages: the cluster of the currently viewed resource
 *  - On any other page: one of the selected clusters
 *
 * To get all currently selected clusters please use {@link useSelectedClusters}
 *
 * @returns currently selected cluster
 */
export function useCluster() {
  const history = useHistory();

  const [cluster, setCluster] = React.useState(getCluster());

  React.useEffect(() => {
    // Listen to route changes
    return history.listen(() => {
      const newCluster = getCluster(history.location.pathname);
      // Update the state only when the cluster changes
      setCluster(currentCluster => (newCluster !== currentCluster ? newCluster : currentCluster));
    });
  }, [history]);

  return cluster;
}

/**
 * Get a list of selected clusters. Updates when the cluster changes.
 *
 * @returns list of selected clusters. if no clusters are selected, an empty list is returned.
 */
export function useSelectedClusters(): string[] {
  const clusterInURL = useCluster();
  const history = useHistory();
  const maybeSelectedClusters = useContext(SelectedClustersContext);

  const clusterGroup = React.useMemo(() => {
    return getSelectedClusters([], history.location.pathname);
  }, [clusterInURL]);

  return maybeSelectedClusters && maybeSelectedClusters.length > 0
    ? maybeSelectedClusters
    : clusterGroup;
}

/**
 * Gets the version of the cluster given by the parameter.
 *
 * @param clusterName - the name of the cluster to query, or the currently selected cluster.
 * @returns a promise that resolves to a dictionary containing version info.
 */
export function getVersion(clusterName: string = ''): Promise<StringDict> {
  return clusterRequest('/version', { cluster: clusterName || getCluster() });
}

export type CancellablePromise = Promise<() => void>;

/**
 * Hook to manage multiple cancellable API calls tied to the active cluster.
 *
 * @param apiCalls - functions returning cancellable promises for API calls.
 */
export function useConnectApi(...apiCalls: (() => CancellablePromise)[]) {
  // Use the location to make sure the API calls are changed, as they may depend on the cluster
  // (defined in the URL ATM).
  const cluster = useCluster();

  React.useEffect(
    () => {
      const cancellables = apiCalls.map(func => func());

      return function cleanup() {
        for (const cancellablePromise of cancellables) {
          cancellablePromise.then(cancellable => cancellable());
        }
      };
    },
    // If we add the apiCalls to the dependency list, then it actually
    // results in undesired reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cluster]
  );
}

/**
 * See {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#list-and-watch-filtering|Label selector examples},
 * {@link https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#resources-that-support-set-based-requirements|deployment selector example},
 * {@link https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/selection/operator.go#L24|possible operators}, and
 * {@link https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/labels/selector.go#L305|Format rule for expressions}.
 */
export function labelSelectorToQuery(labelSelector: LabelSelector) {
  const segments: string[] = [];

  segments.push(...(matchLabelsSimplifier(labelSelector.matchLabels, true) || []));

  const matchExpressions = labelSelector.matchExpressions ?? [];

  segments.push(...matchExpressionSimplifier(matchExpressions));
  if (segments.length === 0) {
    return '';
  }

  return segments.join(',');
}

/**
 * Simplifies a matchLabels object into an array of string expressions.
 *
 * @param matchLabels - the matchLabels object from a LabelSelector.
 * @param isEqualSeperator - whether to use "=" as the separator instead of ":".
 * @returns an array of simplified label strings, or an empty string.
 */
export function matchLabelsSimplifier(
  matchLabels: LabelSelector['matchLabels'],
  isEqualSeperator = false
): string[] | '' {
  if (!matchLabels) {
    return '';
  }

  const segments: string[] = [];
  for (const k in matchLabels) {
    if (isEqualSeperator) {
      segments.push(`${k}=${matchLabels[k]}`);
      continue;
    }
    segments.push(`${k}: ${matchLabels[k]}`);
  }

  return segments;
}

/**
 * Simplifies a matchExpressions array into an array of string representations.
 *
 * @param matchExpressions - the matchExpressionss array from a LabelSelector.
 * @returns an array of simplified expression strings, or an empty string.
 */
export function matchExpressionSimplifier(
  matchExpressions: LabelSelector['matchExpressions']
): string[] | '' {
  if (!matchExpressions) {
    return '';
  }

  const segments: string[] = [];
  for (const expr of matchExpressions) {
    let segment = '';
    if (expr.operator === 'DoesNotExist') {
      segment += '!';
    }

    let needsParensWrap = false;
    const NoLengthLimits = -1;
    let expectedValuesLength = NoLengthLimits;

    segment += expr.key;
    switch (expr.operator) {
      case 'Equals':
        segment += '=';
        expectedValuesLength = 1;
        break;
      case 'DoubleEquals':
        segment += '==';
        expectedValuesLength = 1;
        break;
      case 'NotEquals':
        segment += '!=';
        expectedValuesLength = 1;
        break;
      case 'In':
        segment += ' in ';
        needsParensWrap = true;
        break;
      case 'NotIn':
        segment += ' notin ';
        needsParensWrap = true;
        break;
      case 'GreaterThan':
        segment += '>';
        expectedValuesLength = 1;
        break;
      case 'LessThan':
        segment += '<';
        expectedValuesLength = 1;
        break;
      case 'Exists':
      case 'DoesNotExist':
        expectedValuesLength = 0;
        break;
    }

    let values = '';

    if (expectedValuesLength === 1) {
      values = expr.values[0] ?? '';
    } else if (expectedValuesLength === NoLengthLimits) {
      values = [...(expr.values ?? [])].sort().join(',');
      if (needsParensWrap) {
        values = '(' + values + ')';
      }
    }

    segment += values;
    segments.push(segment);
  }

  return segments;
}

/** Hook to get the version of the clusters given by the parameter.
 *
 * @param clusters
 * @returns a map with cluster -> version-info, and a map with cluster -> error.
 */
export function useClustersVersion(clusters: Cluster[]) {
  type VersionInfo = {
    version: StringDict | null;
    error: ApiError | null;
  };

  const [clusterNames, setClusterNames] = React.useState<string[]>(
    Object.values(clusters).map(c => c.name)
  );
  const [versions, setVersions] = React.useState<{ [cluster: string]: VersionInfo }>({});
  const versionFetchInterval = 10000; // ms
  const cancelledRef = React.useRef(false);
  const lastUpdateRef = React.useRef(0);

  React.useEffect(() => {
    // We sort the lists so the order of clusters doesn't influence our comparison. We only
    // care for presence, not for order.
    const newClusterNames = Object.values(clusters)
      .map(c => c.name)
      .sort();
    const sortedClusterNames = [...clusterNames].sort();
    if (_.isEqual(sortedClusterNames, clusterNames)) {
      return;
    }

    setClusterNames(newClusterNames);
    lastUpdateRef.current = Date.now();
  }, [clusters, clusterNames]);

  React.useEffect(() => {
    const newVersions: typeof versions = {};

    function updateValues() {
      if (cancelledRef.current) {
        return;
      }

      let needsUpdate = false;

      setVersions(currentVersions => {
        const newVersionsToSet = { ...currentVersions };
        for (const clusterName in newVersions) {
          if (!_.isEqual(newVersionsToSet[clusterName], newVersions[clusterName])) {
            needsUpdate = true;
            newVersionsToSet[clusterName] = newVersions[clusterName];
          }
        }

        return needsUpdate ? newVersionsToSet : currentVersions;
      });
    }

    clusterNames.forEach(clusterName => {
      getVersion(clusterName)
        .then(version => {
          newVersions[clusterName] = { version, error: null };
        })
        .catch(err => {
          newVersions[clusterName] = { version: null, error: err };
        })
        .finally(() => {
          updateValues();
        });
    });
  }, [clusterNames]);

  React.useEffect(() => {
    cancelledRef.current = false;
    // Trigger periodically
    const timeout = setInterval(() => {
      if (cancelledRef.current) {
        return;
      }

      if (Date.now() - lastUpdateRef.current > versionFetchInterval - 1) {
        // Refreshes the list of clusters
        // Creating a new array will trigger the useEffect above
        // effectively refreshing the versions/errors/statuses
        setClusterNames([...clusterNames]);
      }
    }, versionFetchInterval);

    return function cleanup() {
      cancelledRef.current = true;
      clearInterval(timeout);
    };
  }, []);

  return React.useMemo<
    [{ [clusterName: string]: StringDict }, { [clusterName: string]: VersionInfo['error'] }]
  >(() => {
    const versionsInfo: { [clusterName: string]: StringDict } = {};
    const errorsInfo: { [clusterName: string]: VersionInfo['error'] } = {};

    Object.entries(versions).forEach(([clusterName, versionInfo]) => {
      if (!!versionInfo.version) {
        versionsInfo[clusterName] = versionInfo.version;
      }
      errorsInfo[clusterName] = versionInfo.error;
    });

    return [versionsInfo, errorsInfo];
  }, [versions]);
}

// Other exports that can be used by plugins:
export * as cluster from './cluster';
export * as clusterRole from './clusterRole';
export * as clusterRoleBinding from './clusterRoleBinding';
export * as configMap from './configMap';
export * as crd from './crd';
export * as cronJob from './cronJob';
export * as daemonSet from './daemonSet';
export * as deployment from './deployment';
export * as event from './event';
export * as ingress from './ingress';
export * as ingressClass from './ingressClass';
export * as job from './job';
export * as namespace from './namespace';
export * as node from './node';
export * as persistentVolume from './persistentVolume';
export * as persistentVolumeClaim from './persistentVolumeClaim';
export * as pod from './pod';
export * as replicaSet from './replicaSet';
export * as role from './role';
export * as roleBinding from './roleBinding';
export * as secret from './secret';
export * as service from './service';
export * as serviceAccount from './serviceAccount';
export * as statefulSet from './statefulSet';
export * as storageClass from './storageClass';
