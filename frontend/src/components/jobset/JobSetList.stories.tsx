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
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import List from './List';
import { jobSets } from './storyHelper';

const jobSetList = generateK8sResourceList(jobSets[0], { numResults: 4 });

const failedJobSet = jobSetList[1];
failedJobSet.status = {
  ...failedJobSet.status,
  conditions: [
    {
      type: 'Failed',
      status: 'True',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

const suspendedJobSet = jobSetList[2];
suspendedJobSet.status = {
  ...suspendedJobSet.status,
  conditions: [
    {
      type: 'Suspended',
      status: 'True',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

const startupPolicyJobSet = jobSetList[3];
startupPolicyJobSet.status = {
  ...startupPolicyJobSet.status,
  conditions: [
    {
      type: 'StartupPolicyCompleted',
      status: 'True',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
    {
      type: 'Completed',
      status: 'True',
      lastTransitionTime: '2023-07-28T08:02:00Z',
    },
  ],
};

export default {
  title: 'JobSet/List',
  component: List,
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
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/apis/jobset.x-k8s.io/v1alpha2/jobsets', () =>
            HttpResponse.json({
              kind: 'JobSetList',
              metadata: {},
              items: jobSetList,
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <List />;
};

export const Items = Template.bind({});
