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
import MutatingAdmissionPolicyBindingDetails from './Details';

const MUTATING_ADMISSION_POLICY_BINDING = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicyBinding',
  metadata: {
    creationTimestamp: '2025-01-01T00:00:00Z',
    generation: 1,
    name: 'label-pods-binding',
    resourceVersion: '12345',
    uid: '12345',
  },
  spec: {
    matchResources: {
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
    paramRef: {
      name: 'label-config',
      namespace: 'default',
      parameterNotFoundAction: 'Deny',
      selector: {
        matchExpressions: [
          {
            key: 'environment',
            operator: 'In',
            values: ['production', 'staging'],
          },
        ],
        matchLabels: {
          app: 'headlamp',
        },
      },
    },
    policyName: 'label-pods',
  },
};

export default {
  title: 'MutatingAdmissionPolicyBinding/DetailsView',
  component: MutatingAdmissionPolicyBindingDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'label-pods-binding' }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <MutatingAdmissionPolicyBindingDetails />;
};

export const MutatingAdmissionPolicyBindingDetail = Template.bind({});
MutatingAdmissionPolicyBindingDetail.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => HttpResponse.json(MUTATING_ADMISSION_POLICY_BINDING)
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => HttpResponse.json(MUTATING_ADMISSION_POLICY_BINDING)
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings/label-pods-binding`,
          () =>
            HttpResponse.json({
              ...MUTATING_ADMISSION_POLICY_BINDING,
              apiVersion: 'admissionregistration.k8s.io/v1alpha1',
            })
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicybindings`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicybindings`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings`,
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
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => new Promise(() => {})
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => new Promise(() => {})
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings/label-pods-binding`,
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
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings/label-pods-binding`,
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
