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

import { KubeValidatingAdmissionPolicyBinding } from '../../lib/k8s/validatingAdmissionPolicyBinding';

export const mockBinding: KubeValidatingAdmissionPolicyBinding = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyBinding',
  metadata: {
    name: 'test-binding',
    uid: '67890',
    creationTimestamp: '2023-01-01T00:00:00Z',
  },
  spec: {
    policyName: 'test-policy',
    validationActions: ['Deny', 'Audit'],
    matchResources: {
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
          resourceNames: ['my-deployment'],
        },
      ],
      excludeResourceRules: [
        {
          apiGroups: ['apps'],
          apiVersions: ['v1'],
          operations: ['DELETE'],
          resources: ['deployments'],
          resourceNames: ['my-important-deployment'],
        },
      ],
    },
    paramRef: {
      name: 'test-param',
      namespace: 'default',
      parameterNotFoundAction: 'Allow',
      selector: {
        matchLabels: {
          app: 'test',
        },
      },
    },
  },
};

export const mockBindingList = {
  kind: 'ValidatingAdmissionPolicyBindingList',
  apiVersion: 'admissionregistration.k8s.io/v1',
  metadata: {
    resourceVersion: '123456',
  },
  items: [mockBinding],
};
