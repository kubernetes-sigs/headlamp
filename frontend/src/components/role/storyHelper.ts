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

import { KubeRole } from '../../lib/k8s/role';
import { KubeRoleBinding } from '../../lib/k8s/roleBinding';
import { API_BASE } from '../../test';

/** Base URL of the mock API server used by the role stories' MSW handlers. */
export const BASE_URL = API_BASE;

export const ROLE_DUMMY_DATA: KubeRole[] = [
  {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
      name: 'pod-reader',
      namespace: 'default',
      uid: 'role-pod-reader-uid',
      resourceVersion: '101',
      creationTimestamp: '2023-04-01T10:00:00Z',
      labels: {
        'app.kubernetes.io/part-of': 'demo',
      },
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['pods', 'pods/log'],
        verbs: ['get', 'list', 'watch'],
        nonResourceURLs: [],
        resourceNames: [],
      },
    ],
  },
];

export const CLUSTER_ROLE_DUMMY_DATA: KubeRole[] = [
  {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: {
      name: 'node-viewer',
      uid: 'clusterrole-node-viewer-uid',
      resourceVersion: '102',
      creationTimestamp: '2023-04-01T10:05:00Z',
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['nodes', 'nodes/status'],
        verbs: ['get', 'list', 'watch'],
        nonResourceURLs: [],
        resourceNames: [],
      },
    ],
  },
];

export const ROLE_BINDING_DUMMY_DATA: KubeRoleBinding[] = [
  {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: 'read-pods',
      namespace: 'default',
      uid: 'rolebinding-read-pods-uid',
      resourceVersion: '201',
      creationTimestamp: '2023-04-01T10:10:00Z',
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'Role',
      name: 'pod-reader',
    },
    subjects: [
      {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'User',
        name: 'jane',
      },
      {
        kind: 'ServiceAccount',
        name: 'default',
        namespace: 'default',
      },
    ],
  },
];

export const CLUSTER_ROLE_BINDING_DUMMY_DATA: KubeRoleBinding[] = [
  {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: {
      name: 'view-nodes',
      uid: 'clusterrolebinding-view-nodes-uid',
      resourceVersion: '202',
      creationTimestamp: '2023-04-01T10:15:00Z',
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'node-viewer',
    },
    subjects: [
      {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Group',
        name: 'operators',
      },
    ],
  },
];
