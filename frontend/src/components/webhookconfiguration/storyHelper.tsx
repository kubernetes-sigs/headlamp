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

export const createMWC = (withService: boolean) => ({
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingWebhookConfiguration',
  metadata: {
    creationTimestamp: '2022-10-14T11:25:22Z',
    generation: 1,
    labels: {
      'admissions.enforcer/disabled': 'true',
    },
    name: 'webhook-admission-controller',
    resourceVersion: '123',
    uid: '123-abcd',
  },
  webhooks: [
    {
      admissionReviewVersions: ['v1beta1'],
      clientConfig: {
        caBundle: 'dGhpcy1pcy1hLXRlc3QK',
        ...(withService
          ? {
              service: {
                name: 'my-service',
                namespace: 'my-namespace',
                path: '/mutate-nodes',
              },
            }
          : {
              url: 'https://localhost:8443/mutate-nodes',
            }),
      },
      failurePolicy: 'Fail',
      matchPolicy: 'Exact',
      name: 'webhook-admission-controller.example.com',
      namespaceSelector: {
        matchExpressions: [
          {
            key: 'validating-webhook',
            operator: 'In',
            values: ['true'],
          },
        ],
        matchLabels: {
          'validating-webhook': 'true',
        },
      },
      objectSelector: {
        matchExpressions: [
          {
            key: 'validating-webhook',
            operator: 'In',
            values: ['true'],
          },
        ],
        matchLabels: {
          'validating-webhook': 'true',
        },
      },
      reinvocationPolicy: 'Never',
      rules: [
        {
          apiGroups: [''],
          apiVersions: ['v1'],
          operations: ['CREATE'],
          resources: ['pods'],
          scope: '*',
        },
      ],
      sideEffects: 'NoneOnDryRun',
      timeoutSeconds: 10,
    },
  ],
});

export const createVWC = (withService: boolean) => ({
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingWebhookConfiguration',
  metadata: {
    creationTimestamp: '2022-10-14T11:25:22Z',
    generation: 1,
    labels: {
      'admissions.enforcer/disabled': 'true',
    },
    name: 'my-validating-webhook',
    resourceVersion: '123',
    uid: '123-abc',
  },
  webhooks: [
    {
      admissionReviewVersions: ['v1beta1'],
      clientConfig: {
        caBundle: 'dGhpcy1pcy1hLXRlc3QK',
        ...(withService
          ? {
              service: {
                name: 'my-service',
                namespace: 'my-namespace',
                path: '/validate-nodes',
              },
            }
          : {
              url: 'https://localhost:8443/validate-nodes',
            }),
      },
      failurePolicy: 'Fail',
      matchPolicy: 'Equivalent',
      name: 'my-node-validating-webhook.example.com',
      namespaceSelector: {
        matchExpressions: [
          {
            key: 'validating-webhook',
            operator: 'In',
            values: ['true'],
          },
        ],
        matchLabels: {
          'validating-webhook': 'true',
        },
      },
      objectSelector: {
        matchExpressions: [
          {
            key: 'validating-webhook',
            operator: 'In',
            values: ['true'],
          },
        ],
        matchLabels: {
          'validating-webhook': 'true',
        },
      },
      rules: [
        {
          apiGroups: [''],
          apiVersions: ['v1'],
          operations: ['UPDATE'],
          resources: ['nodes'],
          scope: '*',
        },
      ],
      sideEffects: 'NoneOnDryRun',
      timeoutSeconds: 5,
    },
  ],
});
