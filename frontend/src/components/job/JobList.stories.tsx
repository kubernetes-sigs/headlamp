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
import { jobs } from './storyHelper';

const jobList = generateK8sResourceList(jobs[0], { numResults: 4 });

const failedJob = jobList[1];
failedJob.status = {
  ...failedJob.status,
  conditions: [
    {
      type: 'Failed',
      status: 'True',
      lastProbeTime: '2023-07-28T08:01:00Z',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

const suspendedJob = jobList[2];
suspendedJob.status = {
  ...suspendedJob.status,
  conditions: [
    {
      type: 'Suspended',
      status: 'True',
      lastProbeTime: '2023-07-28T08:01:00Z',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

const successCriteriaMetJob = jobList[3];
successCriteriaMetJob.status = {
  ...successCriteriaMetJob.status,
  conditions: [
    {
      type: 'SuccessCriteriaMet',
      status: 'True',
      lastProbeTime: '2023-07-28T08:01:00Z',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
    {
      type: 'Complete',
      status: 'True',
      lastProbeTime: '2023-07-28T08:01:00Z',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

export default {
  title: 'Job/List',
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
          http.get('http://localhost:4466/apis/batch/v1/jobs', () =>
            HttpResponse.json({
              kind: 'JobsList',
              metadata: {},
              items: jobList,
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
