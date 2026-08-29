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
import ValidatingAdmissionPolicyBindingDetails from './Details';

const sampleBinding = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'ValidatingAdmissionPolicyBinding',
  metadata: {
    name: 'demo-binding',
    creationTimestamp: '2026-01-01T00:00:00Z',
  },
  spec: {
    policyName: 'demo-policy',
    validationActions: ['Deny', 'Warn'],
    matchResources: {
      matchPolicy: 'Equivalent',
    },
    paramRef: {
      name: 'demo-param',
      namespace: 'demo-namespace',
      parameterNotFoundAction: 'Deny',
    },
  },
};

export default {
  title: 'ValidatingAdmissionPolicyBinding/Details',
  component: ValidatingAdmissionPolicyBindingDetails,
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings/demo-binding`,
            () => HttpResponse.json(sampleBinding)
          ),
          http.get(`${API_BASE}/api/v1/events`, () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext routerMap={{ name: 'demo-binding' }}>
      <ValidatingAdmissionPolicyBindingDetails />
    </TestContext>
  );
};

export const Default = Template.bind({});
