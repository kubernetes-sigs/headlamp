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

import { http, HttpResponse } from 'msw';
import type { KubeFlowSchema } from '../../lib/k8s/flowSchema';
import { API_BASE } from '../../test';

const apiVersion = 'flowcontrol.apiserver.k8s.io/v1';
const api = `${API_BASE}/clusters/main/apis/${apiVersion}`;
export const flowSchemaUrl = `${api}/flowschemas`;

export const servesFlowSchemas = http.get(api, () =>
  HttpResponse.json({
    kind: 'APIResourceList',
    groupVersion: apiVersion,
    resources: [{ name: 'flowschemas', kind: 'FlowSchema', namespaced: false }],
  })
);

export const flowSchemaList = (items: KubeFlowSchema[]) =>
  HttpResponse.json({ apiVersion, kind: 'FlowSchemaList', items, metadata: {} });

const creationTimestamp = '2022-01-01T00:00:00Z';

/**
 * Taken from the schemas the apiserver bootstraps, plus one dangling schema, which
 * is the state an operator is looking for and which no cluster ships by default.
 */
export const FLOW_SCHEMA_DUMMY_DATA: KubeFlowSchema[] = [
  {
    apiVersion,
    kind: 'FlowSchema',
    metadata: { name: 'exempt', creationTimestamp, uid: 'fs-uid-exempt' },
    spec: {
      priorityLevelConfiguration: { name: 'exempt' },
      matchingPrecedence: 1,
      rules: [
        {
          subjects: [{ kind: 'Group', group: { name: 'system:masters' } }],
          resourceRules: [
            {
              verbs: ['*'],
              apiGroups: ['*'],
              resources: ['*'],
              clusterScope: true,
              namespaces: ['*'],
            },
          ],
        },
      ],
    },
    status: {
      conditions: [
        {
          type: 'Dangling',
          status: 'False',
          reason: 'Found',
          message:
            'This FlowSchema references the PriorityLevelConfiguration object named "exempt" and it exists',
        },
      ],
    },
  },
  {
    apiVersion,
    kind: 'FlowSchema',
    metadata: { name: 'system-leader-election', creationTimestamp, uid: 'fs-uid-leader' },
    spec: {
      priorityLevelConfiguration: { name: 'leader-election' },
      matchingPrecedence: 100,
      distinguisherMethod: { type: 'ByUser' },
      rules: [
        {
          subjects: [
            { kind: 'User', user: { name: 'system:kube-controller-manager' } },
            { kind: 'User', user: { name: 'system:kube-scheduler' } },
            {
              kind: 'ServiceAccount',
              serviceAccount: { name: '*', namespace: 'kube-system' },
            },
          ],
          resourceRules: [
            {
              verbs: ['get', 'create', 'update'],
              apiGroups: ['coordination.k8s.io'],
              resources: ['leases'],
              namespaces: ['*'],
            },
          ],
        },
      ],
    },
    status: {
      conditions: [
        {
          type: 'Dangling',
          status: 'False',
          reason: 'Found',
          message:
            'This FlowSchema references the PriorityLevelConfiguration object named "leader-election" and it exists',
        },
      ],
    },
  },
  {
    apiVersion,
    kind: 'FlowSchema',
    metadata: { name: 'team-batch-jobs', creationTimestamp, uid: 'fs-uid-dangling' },
    spec: {
      priorityLevelConfiguration: { name: 'batch-low' },
      matchingPrecedence: 900,
      distinguisherMethod: { type: 'ByNamespace' },
      rules: [
        {
          subjects: [{ kind: 'Group', group: { name: 'batch-operators' } }],
          nonResourceRules: [{ verbs: ['get'], nonResourceURLs: ['/healthz', '/readyz'] }],
        },
      ],
    },
    status: {
      conditions: [
        {
          type: 'Dangling',
          status: 'True',
          reason: 'NotFound',
          message:
            'This FlowSchema references the PriorityLevelConfiguration object named "batch-low" and it does not exist',
        },
      ],
    },
  },
  {
    apiVersion,
    kind: 'FlowSchema',
    metadata: { name: 'pending-schema', creationTimestamp, uid: 'fs-uid-pending' },
    spec: {
      priorityLevelConfiguration: { name: 'catch-all' },
      matchingPrecedence: 1000,
    },
  },
];
