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
import type { KubePriorityLevelConfiguration } from '../../lib/k8s/priorityLevelConfiguration';
import { API_BASE } from '../../test';

const apiVersion = 'flowcontrol.apiserver.k8s.io/v1';
const api = `${API_BASE}/clusters/main/apis/${apiVersion}`;
export const priorityLevelUrl = `${api}/prioritylevelconfigurations`;

export const servesPriorityLevels = http.get(api, () =>
  HttpResponse.json({
    kind: 'APIResourceList',
    groupVersion: apiVersion,
    resources: [
      {
        name: 'prioritylevelconfigurations',
        kind: 'PriorityLevelConfiguration',
        namespaced: false,
      },
    ],
  })
);

export const allowsActions = http.post(
  `${API_BASE}/clusters/main/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
  () => HttpResponse.json({ status: { allowed: true } })
);

export const priorityLevelList = (items: KubePriorityLevelConfiguration[]) =>
  HttpResponse.json({ apiVersion, kind: 'PriorityLevelConfigurationList', items, metadata: {} });

const creationTimestamp = '2022-01-01T00:00:00Z';

/** A queued level, a rejecting one, and the exempt level every cluster ships. */
export const PRIORITY_LEVEL_DUMMY_DATA: KubePriorityLevelConfiguration[] = [
  {
    apiVersion,
    kind: 'PriorityLevelConfiguration',
    metadata: { name: 'leader-election', creationTimestamp, uid: 'plc-uid-leader' },
    spec: {
      type: 'Limited',
      limited: {
        nominalConcurrencyShares: 100,
        lendablePercent: 90,
        limitResponse: {
          type: 'Queue',
          queuing: { queues: 128, handSize: 6, queueLengthLimit: 50 },
        },
      },
    },
  },
  {
    apiVersion,
    kind: 'PriorityLevelConfiguration',
    metadata: { name: 'catch-all', creationTimestamp, uid: 'plc-uid-catch' },
    spec: {
      type: 'Limited',
      limited: {
        nominalConcurrencyShares: 5,
        lendablePercent: 0,
        limitResponse: { type: 'Reject' },
      },
    },
  },
  {
    apiVersion,
    kind: 'PriorityLevelConfiguration',
    metadata: { name: 'exempt', creationTimestamp, uid: 'plc-uid-exempt' },
    spec: {
      type: 'Exempt',
      exempt: { nominalConcurrencyShares: 0, lendablePercent: 0 },
    },
  },
];
