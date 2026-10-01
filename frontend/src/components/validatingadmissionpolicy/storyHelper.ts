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

export const mockPolicy = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicy',
  metadata: {
    creationTimestamp: '2023-10-14T11:25:22Z',
    generation: 1,
    name: 'demo-policy.example.com',
    resourceVersion: '123',
    uid: '123-abcd',
  },
  spec: {
    failurePolicy: 'Fail',
    paramKind: {
      apiVersion: 'rules.example.com/v1',
      kind: 'ReplicaLimit',
    },
    matchConstraints: {
      resourceRules: [
        {
          apiGroups: ['apps'],
          apiVersions: ['v1'],
          operations: ['CREATE', 'UPDATE'],
          resources: ['deployments'],
        },
      ],
    },
    validations: [
      {
        expression: 'object.spec.replicas <= params.maxReplicas',
        message: 'too many replicas',
      },
    ],
  },
};

export const mockBinding = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyBinding',
  metadata: {
    creationTimestamp: '2023-10-14T11:25:22Z',
    generation: 1,
    name: 'demo-binding-test.example.com',
    resourceVersion: '124',
    uid: '124-abcd',
  },
  spec: {
    policyName: 'demo-policy.example.com',
    paramRef: {
      name: 'replica-limit-test.example.com',
      namespace: 'default',
    },
    validationActions: ['Deny'],
    matchResources: {
      namespaceSelector: {
        matchLabels: {
          environment: 'test',
        },
      },
    },
  },
};
