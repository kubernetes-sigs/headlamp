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
import { mockBinding } from './storyHelper';

export default {
  title: 'ValidatingAdmissionPolicyBinding/DetailsView',
  component: ValidatingAdmissionPolicyBindingDetails,
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'test-binding' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings`,
            () => HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <ValidatingAdmissionPolicyBindingDetails />;
};

export const Item = Template.bind({});
Item.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings/test-binding',
          () => HttpResponse.json(mockBinding)
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
          'http://localhost:4466/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings/test-binding',
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
