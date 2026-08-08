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
import { leaderWorkerSets } from './storyHelper';

const leaderWorkerSetList = generateK8sResourceList(leaderWorkerSets[0], { numResults: 4 });

// Partially ready: some groups are still starting up.
const partiallyReadyLeaderWorkerSet = leaderWorkerSetList[1];
partiallyReadyLeaderWorkerSet.status = {
  ...partiallyReadyLeaderWorkerSet.status,
  readyReplicas: 1,
  conditions: [
    {
      type: 'Progressing',
      status: 'True',
      reason: 'GroupsAreProgressing',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

// No group is ready yet.
const unavailableLeaderWorkerSet = leaderWorkerSetList[2];
unavailableLeaderWorkerSet.status = {
  ...unavailableLeaderWorkerSet.status,
  readyReplicas: 0,
  conditions: [
    {
      type: 'Available',
      status: 'False',
      reason: 'NoGroupsReady',
      lastTransitionTime: '2023-07-28T08:01:00Z',
    },
  ],
};

// A rollout in flight, which is transitional even though the counts match.
const updatingLeaderWorkerSet = leaderWorkerSetList[3];
updatingLeaderWorkerSet.spec = {
  ...updatingLeaderWorkerSet.spec,
  replicas: 4,
};
updatingLeaderWorkerSet.status = {
  ...updatingLeaderWorkerSet.status,
  replicas: 4,
  readyReplicas: 4,
  updatedReplicas: 2,
  conditions: [
    {
      type: 'UpdateInProgress',
      status: 'True',
      reason: 'GroupsUpdating',
      lastTransitionTime: '2023-07-28T08:02:00Z',
    },
  ],
};

export default {
  title: 'LeaderWorkerSet/List',
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
          http.get(`${API_BASE}/apis/leaderworkerset.x-k8s.io/v1/leaderworkersets`, () =>
            HttpResponse.json({
              kind: 'LeaderWorkerSetList',
              metadata: {},
              items: leaderWorkerSetList,
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
