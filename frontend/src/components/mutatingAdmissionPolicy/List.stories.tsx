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
import MutatingAdmissionPolicy from '../../lib/k8s/mutatingAdmissionPolicy';
import { API_BASE, TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import List from './List';

const MUTATING_ADMISSION_POLICY = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicy',
  metadata: {
    name: 'label-pods-{{i}}',
    uid: 'label-pods-{{i}}',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  spec: {
    failurePolicy: 'Fail',
    mutations: [
      {
        patchType: 'ApplyConfiguration',
        applyConfiguration: {
          expression: "Object{metadata: Object.metadata{labels: {'managed-by': 'headlamp'}}}",
        },
      },
    ],
    reinvocationPolicy: 'IfNeeded',
  },
};

const items = generateK8sResourceList(MUTATING_ADMISSION_POLICY, {
  numResults: 3,
  instantiateAs: MutatingAdmissionPolicy,
}).map(item => item.jsonData);

const apiVersions = ['v1', 'v1beta1', 'v1alpha1'];
const listResponse = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicyList',
  items,
  metadata: {},
};

export default {
  title: 'MutatingAdmissionPolicy/ListView',
  component: List,
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
        storyBase: [],
        story: apiVersions.map(version =>
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/${version}/mutatingadmissionpolicies`,
            () => HttpResponse.json(listResponse)
          )
        ),
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <List />;
};

export const Items = Template.bind({});
