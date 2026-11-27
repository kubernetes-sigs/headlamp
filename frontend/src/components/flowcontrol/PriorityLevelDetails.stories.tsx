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

import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { expect, within } from 'storybook/test';
import { TestContext } from '../../test';
import PriorityLevelDetails from './PriorityLevelDetails';
import {
  allowsActions,
  PRIORITY_LEVEL_DUMMY_DATA,
  priorityLevelList,
  priorityLevelUrl,
} from './priorityLevelStoryHelper';

const [queued, rejecting, exempt] = PRIORITY_LEVEL_DUMMY_DATA;

const meta = {
  title: 'FlowControl/PriorityLevelDetails',
  component: PriorityLevelDetails,
  args: { cluster: 'main', name: queued.metadata.name },
  decorators: [
    (Story, { args }) => (
      <TestContext routerMap={{ cluster: 'main', name: args.name! }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
} satisfies Meta<typeof PriorityLevelDetails>;
export default meta;

type Story = StoryObj<typeof meta>;
const collection = http.get(priorityLevelUrl, () => priorityLevelList(PRIORITY_LEVEL_DUMMY_DATA));
const detailsUrl = (name: string) => `${priorityLevelUrl}/${name}`;

function mswFor(name: string, respond: () => Response | Promise<Response>) {
  return { handlers: { story: [allowsActions, collection, http.get(detailsUrl(name), respond)] } };
}

export const Queued: Story = {
  parameters: {
    msw: mswFor(queued.metadata.name, () => HttpResponse.json(queued)),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('Queue Length Limit')).toBeVisible();
        expect(screen.getByText('128')).toBeVisible();
        expect(screen.getByText('6')).toBeVisible();
        expect(screen.getByText('50')).toBeVisible();
      },
    },
  },
};

export const Rejecting: Story = {
  args: { name: rejecting.metadata.name },
  parameters: {
    msw: mswFor(rejecting.metadata.name, () => HttpResponse.json(rejecting)),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('Reject')).toBeVisible();
        expect(screen.queryByText('Queue Length Limit')).toBeNull();
      },
    },
  },
};

export const Exempt: Story = {
  args: { name: exempt.metadata.name },
  parameters: {
    msw: mswFor(exempt.metadata.name, () => HttpResponse.json(exempt)),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('Exempt', { exact: true })).toBeVisible();
        expect(screen.queryByText('Queue Length Limit')).toBeNull();
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storyshots: { disable: true },
    msw: mswFor(queued.metadata.name, () => new Promise(() => {})),
  },
};

export const Error: Story = {
  parameters: { msw: mswFor(queued.metadata.name, () => HttpResponse.error()) },
};
