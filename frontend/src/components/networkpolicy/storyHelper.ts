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

const creationTimestamp = new Date('2024-05-01T10:00:00Z').toISOString();

export const NETWORK_POLICY_DETAIL = {
  apiVersion: 'networking.k8s.io/v1',
  kind: 'NetworkPolicy',
  metadata: {
    name: 'allow-frontend-traffic',
    namespace: 'default',
    creationTimestamp,
    uid: 'network-policy-1',
  },
  spec: {
    podSelector: {
      matchLabels: {
        app: 'frontend',
      },
    },
    policyTypes: ['Ingress', 'Egress'],
    ingress: [
      {
        from: [
          {
            podSelector: {
              matchLabels: {
                app: 'backend',
              },
            },
          },
          {
            namespaceSelector: {
              matchLabels: {
                environment: 'production',
              },
            },
          },
        ],
        ports: [
          {
            protocol: 'TCP',
            port: 80,
          },
          {
            protocol: 'TCP',
            port: 443,
          },
        ],
      },
    ],
    egress: [
      {
        to: [
          {
            ipBlock: {
              cidr: '10.0.0.0/24',
              except: ['10.0.0.10/32'],
            },
          },
          {
            podSelector: {
              matchLabels: {
                role: 'dns',
              },
            },
          },
          {
            namespaceSelector: {
              matchLabels: {
                environment: 'shared',
              },
            },
          },
        ],
        ports: [
          {
            protocol: 'TCP',
            port: 53,
          },
          {
            protocol: 'UDP',
            port: 53,
            endPort: 54,
          },
        ],
      },
    ],
  },
};

export const NETWORK_POLICY_ITEMS = [
  NETWORK_POLICY_DETAIL,
  {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: 'deny-external-egress',
      namespace: 'default',
      creationTimestamp,
      uid: 'network-policy-2',
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'database',
        },
      },
      policyTypes: ['Egress'],
      ingress: [],
      egress: [
        {
          to: [
            {
              ipBlock: {
                cidr: '0.0.0.0/0',
                except: ['10.1.0.0/16'],
              },
            },
            {
              podSelector: {
                matchLabels: {
                  component: 'backup-agent',
                },
              },
            },
          ],
          ports: [
            {
              protocol: 'TCP',
              port: 3306,
            },
            {
              protocol: 'UDP',
              port: 1194,
            },
          ],
        },
      ],
    },
  },
];
