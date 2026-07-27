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
import MutatingAdmissionPolicyDetails from './Details';

const MUTATING_ADMISSION_POLICY = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicy',
  metadata: {
    creationTimestamp: '2025-01-01T00:00:00Z',
    generation: 1,
    name: 'label-pods',
    resourceVersion: '12345',
    uid: '12345',
  },
  spec: {
    failurePolicy: 'Fail',
    matchConditions: [
      {
        name: 'has-label',
        expression: "object.metadata.labels.exists(label, label == 'app')",
      },
    ],
    matchConstraints: {
      excludeResourceRules: [
        {
          apiGroups: [''],
          apiVersions: ['v1'],
          operations: ['DELETE'],
          resources: ['pods/status'],
          scope: 'Namespaced',
        },
      ],
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
    mutations: [
      {
        patchType: 'ApplyConfiguration',
        applyConfiguration: {
          expression: "Object{metadata: Object.metadata{labels: {'managed-by': 'headlamp'}}}",
        },
      },
      {
        patchType: 'JSONPatch',
        jsonPatch: {
          expression: "JSONPatch{op: 'add', path: '/metadata/labels/team', value: 'platform'}",
        },
      },
    ],
    paramKind: {
      apiVersion: 'v1',
      kind: 'ConfigMap',
    },
    reinvocationPolicy: 'IfNeeded',
  },
  status: {
    conditions: [
      {
        lastTransitionTime: '2025-01-01T00:00:00Z',
        message: 'Policy is ready',
        reason: 'Ready',
        status: 'True',
        type: 'Ready',
      },
    ],
    observedGeneration: 1,
  },
};

export default {
  title: 'MutatingAdmissionPolicy/DetailsView',
  component: MutatingAdmissionPolicyDetails,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext routerMap={{ name: 'label-pods' }}>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => {
  return <MutatingAdmissionPolicyDetails />;
};

export const MutatingAdmissionPolicyDetail = Template.bind({});
MutatingAdmissionPolicyDetail.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicies/label-pods`,
          () => HttpResponse.json(MUTATING_ADMISSION_POLICY)
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicies/label-pods`,
          () => HttpResponse.json(MUTATING_ADMISSION_POLICY)
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies/label-pods`,
          () =>
            HttpResponse.json({
              ...MUTATING_ADMISSION_POLICY,
              apiVersion: 'admissionregistration.k8s.io/v1alpha1',
            })
        ),
        http.get(`${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicies`, () =>
          HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicies`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies`,
          () => HttpResponse.error()
        ),
        http.get(`${API_BASE}/api/v1/events`, () =>
          HttpResponse.json({
            kind: 'EventList',
            items: [],
            metadata: {},
          })
        ),
      ],
    },
  },
};

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicies/label-pods`,
          () => new Promise(() => {})
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicies/label-pods`,
          () => new Promise(() => {})
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies/label-pods`,
          () => new Promise(() => {})
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicies/label-pods`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicies/label-pods`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies/label-pods`,
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
