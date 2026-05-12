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

export const createVAP = () => ({
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicy',
  metadata: {
    creationTimestamp: '2024-01-01T00:00:00Z',
    generation: 1,
    name: 'my-vap',
    resourceVersion: '123',
    uid: 'abc-123',
  },
  spec: {
    failurePolicy: 'Fail',
    matchConstraints: {
      matchPolicy: 'Equivalent',
      namespaceSelector: {
        matchLabels: { environment: 'production' },
        matchExpressions: [{ key: 'env', operator: 'In', values: ['prod', 'staging'] }],
      },
      objectSelector: {
        matchLabels: { 'app.kubernetes.io/managed-by': 'helm' },
      },
      resourceRules: [
        {
          apiGroups: [''],
          apiVersions: ['v1'],
          operations: ['CREATE', 'UPDATE'],
          resources: ['pods'],
          scope: 'Namespaced',
        },
      ],
    },
    validations: [
      {
        expression: 'object.spec.replicas <= 5',
        message: 'Replicas must be 5 or fewer',
        reason: 'Invalid',
      },
      {
        expression: "object.metadata.labels.exists(l, l == 'app')",
        messageExpression: "'Missing required label: app'",
      },
    ],
    matchConditions: [
      {
        name: 'exclude-system-namespaces',
        expression: "!object.metadata.namespace.startsWith('kube-')",
      },
    ],
    auditAnnotations: [
      {
        key: 'policy-check',
        valueExpression: "'checked by my-vap'",
      },
    ],
    variables: [
      {
        name: 'maxReplicas',
        expression: '5',
      },
    ],
  },
});

export const createVAPBinding = () => ({
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyBinding',
  metadata: {
    creationTimestamp: '2024-01-01T00:00:00Z',
    generation: 1,
    name: 'my-vap-binding',
    resourceVersion: '456',
    uid: 'def-456',
  },
  spec: {
    policyName: 'my-vap',
    validationActions: ['Deny', 'Audit'],
    matchResources: {
      matchPolicy: 'Equivalent',
      namespaceSelector: {
        matchLabels: { environment: 'production' },
      },
      objectSelector: {
        matchExpressions: [{ key: 'app', operator: 'Exists', values: [] }],
      },
      resourceRules: [
        {
          apiGroups: ['apps'],
          apiVersions: ['v1'],
          operations: ['CREATE', 'UPDATE'],
          resources: ['deployments'],
          scope: 'Namespaced',
        },
      ],
    },
    paramRef: {
      name: 'my-params',
      namespace: 'default',
      parameterNotFoundAction: 'Deny',
      selector: {
        matchLabels: { config: 'vap-params' },
      },
    },
  },
});
