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

import { KubeValidatingAdmissionPolicy } from '../../lib/k8s/validatingAdmissionPolicy';

export const mockPolicy: KubeValidatingAdmissionPolicy = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicy',
  metadata: {
    name: 'test-policy',
    uid: '12345',
    creationTimestamp: '2023-01-01T00:00:00Z',
  },
  spec: {
    failurePolicy: 'Fail',
    matchConstraints: {
      matchPolicy: 'Equivalent',
      namespaceSelector: {
        matchLabels: {
          environment: 'production',
        },
      },
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
        expression: 'object.spec.replicas <= 5',
        message: 'Replicas cannot be greater than 5',
        reason: 'Invalid',
      },
    ],
    auditAnnotations: [
      {
        key: 'high-replica-count',
        valueExpression: '"deployments with more than 3 replicas"',
      },
    ],
    matchConditions: [
      {
        name: 'exclude-kube-system',
        expression: 'request.namespace != "kube-system"',
      },
    ],
    variables: [
      {
        name: 'replicas',
        expression: 'object.spec.replicas',
      },
    ],
  },
};

export const mockPolicyList = {
  kind: 'ValidatingAdmissionPolicyList',
  apiVersion: 'admissionregistration.k8s.io/v1',
  metadata: {
    resourceVersion: '123456',
  },
  items: [mockPolicy],
};
