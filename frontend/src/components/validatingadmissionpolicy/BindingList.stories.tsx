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
import BindingList from './BindingList';
import { mockBinding } from './storyHelper';

export default {
  title: 'ValidatingAdmissionPolicy/BindingList',
  component: BindingList,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => <BindingList />;

export const Items = Template.bind({});
Items.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings`,
          () =>
            HttpResponse.json({
              kind: 'ValidatingAdmissionPolicyBindingList',
              metadata: { resourceVersion: '2' },
              items: [mockBinding],
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
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings`,
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
          `${API_BASE}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings`,
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
