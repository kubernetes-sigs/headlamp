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
import ValidatingAdmissionPolicyList from './List';

const sampleList = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyList',
  metadata: {},
  items: [
    {
      apiVersion: 'admissionregistration.k8s.io/v1',
      kind: 'ValidatingAdmissionPolicy',
      metadata: {
        name: 'demo-policy',
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      spec: {
        failurePolicy: 'Fail',
        validations: [{ expression: 'object.spec.replicas <= 5' }],
      },
    },
  ],
};

export default {
  title: 'ValidatingAdmissionPolicy/List',
  component: ValidatingAdmissionPolicyList,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies`,
            () => HttpResponse.json(sampleList)
          ),
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/validatingadmissionpolicies`,
            () => HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <ValidatingAdmissionPolicyList />;
};

export const Items = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies`,
          () => new Promise(() => {})
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/validatingadmissionpolicies`,
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
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies`,
          () => HttpResponse.error()
        ),
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1beta1/validatingadmissionpolicies`,
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
