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
import { generateK8sResourceList } from '../../test/mocker';
import List from './List';
import { disaggregatedSets } from './storyHelper';

const disaggregatedSetList = generateK8sResourceList(disaggregatedSets[0], { numResults: 4 });

// Partially ready: some slices are still starting up.
const partiallyReadyDisaggregatedSet = disaggregatedSetList[1];
partiallyReadyDisaggregatedSet.status = {
  ...partiallyReadyDisaggregatedSet.status,
  readySlices: 1,
  conditions: [
    {
      type: 'Progressing',
      status: 'True',
      reason: 'SlicesAreProgressing',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

// No slice is ready yet.
const unavailableDisaggregatedSet = disaggregatedSetList[2];
unavailableDisaggregatedSet.status = {
  ...unavailableDisaggregatedSet.status,
  readySlices: 0,
  conditions: [
    {
      type: 'Available',
      status: 'False',
      reason: 'NoSlicesReady',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

// A rollout in flight.
const updatingDisaggregatedSet = disaggregatedSetList[3];
updatingDisaggregatedSet.spec = {
  ...updatingDisaggregatedSet.spec,
  slices: 4,
};
updatingDisaggregatedSet.status = {
  ...updatingDisaggregatedSet.status,
  slices: 4,
  readySlices: 4,
  updatedReplicas: 2,
  conditions: [
    {
      type: 'UpdateInProgress',
      status: 'True',
      reason: 'SlicesUpdating',
      lastTransitionTime: '2023-07-28T08:02:00Z',
    },
  ],
};

export default {
  title: 'DisaggregatedSet/List',
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
          http.get(`${API_BASE}/apis/disaggregatedset.x-k8s.io/v1/disaggregatedsets`, () =>
            HttpResponse.json({
              kind: 'DisaggregatedSetList',
              metadata: {},
              items: disaggregatedSetList,
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
