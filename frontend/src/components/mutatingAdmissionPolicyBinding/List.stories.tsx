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
import MutatingAdmissionPolicyBinding from '../../lib/k8s/mutatingAdmissionPolicyBinding';
import { API_BASE, TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import List from './List';

const MUTATING_ADMISSION_POLICY_BINDING = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicyBinding',
  metadata: {
    name: 'label-pods-binding-{{i}}',
    uid: 'label-pods-binding-{{i}}',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  spec: {
    paramRef: {
      name: 'label-config',
    },
    policyName: 'label-pods',
  },
};

const items = generateK8sResourceList(MUTATING_ADMISSION_POLICY_BINDING, {
  numResults: 3,
  instantiateAs: MutatingAdmissionPolicyBinding,
}).map(item => item.jsonData);

const apiVersions = ['v1', 'v1beta1', 'v1alpha1'];
const listResponse = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingAdmissionPolicyBindingList',
  items,
  metadata: {},
};

export default {
  title: 'MutatingAdmissionPolicyBinding/ListView',
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
            `${API_BASE}/apis/admissionregistration.k8s.io/${version}/mutatingadmissionpolicybindings`,
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
