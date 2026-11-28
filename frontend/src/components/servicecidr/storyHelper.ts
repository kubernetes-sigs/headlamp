/*
 * Copyright 2026 The Kubernetes Authors
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
import type { KubeServiceCIDR } from '../../lib/k8s/serviceCIDR';
import { API_BASE } from '../../test';

const apiVersion = 'networking.k8s.io/v1';
const betaApiVersion = 'networking.k8s.io/v1beta1';
const api = `${API_BASE}/clusters/main/apis/${apiVersion}`;
const betaApi = `${API_BASE}/clusters/main/apis/${betaApiVersion}`;
export const collectionUrl = `${api}/servicecidrs`;
const betaCollectionUrl = `${betaApi}/servicecidrs`;

const notServed = () =>
  HttpResponse.json(
    { kind: 'Status', status: 'Failure', reason: 'NotFound', code: 404 },
    { status: 404 }
  );

export const serviceCIDR: KubeServiceCIDR = {
  apiVersion,
  kind: 'ServiceCIDR',
  metadata: {
    name: 'kubernetes',
    uid: 'servicecidr-kubernetes',
    creationTimestamp: '2022-01-01T00:00:00Z',
    resourceVersion: '1',
  },
  spec: { cidrs: ['10.96.0.0/12', 'fd00:1234::/108'] },
  status: {
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        reason: 'Ready',
        message: 'The ServiceCIDR is ready to allocate IP addresses.',
        lastTransitionTime: '2022-01-01T00:00:00Z',
      },
    ],
  },
};

export const discovery = http.get(api, () =>
  HttpResponse.json({
    kind: 'APIResourceList',
    groupVersion: apiVersion,
    resources: [{ name: 'servicecidrs', kind: 'ServiceCIDR', namespaced: false }],
  })
);

export const allowsActions = http.post(
  `${API_BASE}/clusters/main/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
  () => HttpResponse.json({ status: { allowed: true } })
);

export const collection = http.get(collectionUrl, () =>
  HttpResponse.json({
    apiVersion,
    kind: 'ServiceCIDRList',
    metadata: { resourceVersion: '1' },
    items: [
      serviceCIDR,
      {
        ...serviceCIDR,
        metadata: { ...serviceCIDR.metadata, name: 'pending', uid: 'servicecidr-pending' },
        spec: { cidrs: ['10.112.0.0/16'] },
        status: undefined,
      },
    ],
  })
);

/**
 * The beta endpoints a cluster that serves v1 answers with a 404.
 *
 * ServiceCIDR is declared under both v1 and v1beta1, and endpoint selection probes
 * every declared version at once, so a story answering v1 alone leaves the beta
 * request unhandled. Every story needs these, the error ones included.
 */
export const betaNotServed = [
  http.get(betaCollectionUrl, () => notServed()),
  http.get(`${betaCollectionUrl}/:name`, () => notServed()),
];
