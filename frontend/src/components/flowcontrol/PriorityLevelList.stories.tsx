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
import PriorityLevelList from './PriorityLevelList';
import {
  allowsActions,
  PRIORITY_LEVEL_DUMMY_DATA,
  priorityLevelList,
  priorityLevelUrl,
  servesPriorityLevels,
} from './priorityLevelStoryHelper';

const meta = {
  title: 'FlowControl/PriorityLevels',
  component: PriorityLevelList,
  decorators: [
    Story => (
      <TestContext routerMap={{ cluster: 'main' }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          allowsActions,
          servesPriorityLevels,
          http.get(priorityLevelUrl, () => priorityLevelList(PRIORITY_LEVEL_DUMMY_DATA)),
        ],
      },
    },
  },
} satisfies Meta<typeof PriorityLevelList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Items: Story = {
  parameters: {
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        const queuedLevel = screen.getByRole('link', { name: 'leader-election' });
        const exemptLevel = screen.getByRole('link', { name: 'exempt' });
        expect(queuedLevel).toHaveAttribute(
          'href',
          '/c/main/prioritylevelconfigurations/leader-election'
        );
        expect(within(queuedLevel.closest('tr')!).getByText('Queue')).toBeVisible();
        expect(within(exemptLevel.closest('tr')!).getByText('0', { exact: true })).toBeVisible();
        expect(screen.getByText('Reject')).toBeVisible();
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storyshots: { disable: true },
    msw: {
      handlers: {
        story: [
          allowsActions,
          servesPriorityLevels,
          http.get(priorityLevelUrl, () => new Promise(() => {})),
        ],
      },
    },
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          allowsActions,
          servesPriorityLevels,
          http.get(priorityLevelUrl, () => HttpResponse.error()),
        ],
      },
    },
  },
};
