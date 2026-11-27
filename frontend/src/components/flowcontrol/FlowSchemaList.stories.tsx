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
import FlowSchemaList from './FlowSchemaList';
import {
  FLOW_SCHEMA_DUMMY_DATA,
  flowSchemaList,
  flowSchemaUrl,
  servesFlowSchemas,
} from './flowSchemaStoryHelper';
import { allowsActions } from './priorityLevelStoryHelper';

const meta = {
  title: 'FlowControl/FlowSchemas',
  component: FlowSchemaList,
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
          servesFlowSchemas,
          http.get(flowSchemaUrl, () => flowSchemaList(FLOW_SCHEMA_DUMMY_DATA)),
        ],
      },
    },
  },
} satisfies Meta<typeof FlowSchemaList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Items: Story = {
  parameters: {
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        const valid = within(
          screen.getByRole('link', { name: 'system-leader-election' }).closest('tr')!
        );
        expect(valid.getByRole('link', { name: 'leader-election' })).toHaveAttribute(
          'href',
          '/c/main/prioritylevelconfigurations/leader-election'
        );
        expect(valid.getByText('No')).toBeVisible();
        const dangling = within(
          screen.getByRole('link', { name: 'team-batch-jobs' }).closest('tr')!
        );
        expect(dangling.getByText('Yes')).toBeVisible();
        expect(dangling.getByText('batch-low')).toBeVisible();
        expect(dangling.queryByRole('link', { name: 'batch-low' })).toBeNull();
        expect(screen.getByText('Unknown')).toBeVisible();
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
          servesFlowSchemas,
          http.get(flowSchemaUrl, () => new Promise(() => {})),
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
          servesFlowSchemas,
          http.get(flowSchemaUrl, () => HttpResponse.error()),
        ],
      },
    },
  },
};
