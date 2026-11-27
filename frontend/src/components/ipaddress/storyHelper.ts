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
import type { KubeIPAddress } from '../../lib/k8s/ipAddress';
import { API_BASE } from '../../test';

const apiVersion = 'networking.k8s.io/v1';
const api = `${API_BASE}/clusters/main/apis/${apiVersion}`;
export const collectionUrl = `${api}/ipaddresses`;

export const serviceAddress: KubeIPAddress = {
  apiVersion,
  kind: 'IPAddress',
  metadata: {
    name: '10.96.0.10',
    uid: 'address-kube-dns',
    creationTimestamp: '2022-01-01T00:00:00Z',
    resourceVersion: '1',
  },
  spec: { parentRef: { resource: 'services', namespace: 'kube-system', name: 'kube-dns' } },
};

export const externalAddress: KubeIPAddress = {
  ...serviceAddress,
  metadata: { ...serviceAddress.metadata, name: 'fd00:1234::10', uid: 'address-external' },
  spec: {
    parentRef: {
      group: 'networking.example.com',
      resource: 'services',
      namespace: 'default',
      name: 'external-service',
    },
  },
};

export const discovery = http.get(api, () =>
  HttpResponse.json({
    kind: 'APIResourceList',
    groupVersion: apiVersion,
    resources: [{ name: 'ipaddresses', kind: 'IPAddress', namespaced: false }],
  })
);

export const allowsActions = http.post(
  `${API_BASE}/clusters/main/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
  () => HttpResponse.json({ status: { allowed: true } })
);

export const collection = http.get(collectionUrl, () =>
  HttpResponse.json({
    apiVersion,
    kind: 'IPAddressList',
    metadata: { resourceVersion: '1' },
    items: [serviceAddress, externalAddress],
  })
);
