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

import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { API_BASE, TestContext } from '../../test';
import ValidatingAdmissionPolicyDetails from './Details';

const samplePolicy = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicy',
  metadata: {
    name: 'demo-policy',
    creationTimestamp: '2026-01-01T00:00:00Z',
  },
  spec: {
    failurePolicy: 'Fail',
    matchConstraints: {
      matchPolicy: 'Equivalent',
    },
    paramKind: {
      apiVersion: 'rules.example.com/v1',
      kind: 'ReplicaLimit',
    },
    validations: [
      {
        expression: 'object.spec.replicas <= 5',
        message: 'Replicas must not exceed 5',
        reason: 'Invalid',
      },
    ],
    matchConditions: [
      {
        name: 'exclude-kube-system',
        expression: 'object.metadata.namespace != "kube-system"',
      },
    ],
    auditAnnotations: [
      {
        key: 'high-replica-count',
        valueExpression: 'string(object.spec.replicas)',
      },
    ],
    variables: [
      {
        name: 'maxReplicas',
        expression: '5',
      },
    ],
  },
};

export default {
  title: 'ValidatingAdmissionPolicy/Details',
  component: ValidatingAdmissionPolicyDetails,
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies/demo-policy`,
            () => HttpResponse.json(samplePolicy)
          ),
          http.get(`${API_BASE}/api/v1/events`, () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext routerMap={{ name: 'demo-policy' }}>
      <ValidatingAdmissionPolicyDetails />
    </TestContext>
  );
};

export const Default = Template.bind({});
