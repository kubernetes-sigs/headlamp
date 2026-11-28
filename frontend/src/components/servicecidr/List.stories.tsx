/*
 * Copyright 2026 The Kubernetes Authors
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
import ServiceCIDRList from './List';
import { allowsActions, betaNotServed, collection, collectionUrl, discovery } from './storyHelper';

const meta = {
  title: 'ServiceCIDR/List',
  component: ServiceCIDRList,
  decorators: [
    Story => (
      <TestContext routerMap={{ cluster: 'main' }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: { handlers: { story: [allowsActions, discovery, collection, ...betaNotServed] } },
  },
} satisfies Meta<typeof ServiceCIDRList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Items: Story = {
  parameters: {
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        const link = screen.getByRole('link', { name: 'kubernetes' });
        expect(link).toHaveAttribute('href', '/c/main/servicecidrs/kubernetes');
        const row = within(link.closest('tr')!);
        expect(row.getByText('10.96.0.0/12, fd00:1234::/108')).toBeVisible();
        expect(row.getByText('True')).toBeVisible();
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
          discovery,
          http.get(collectionUrl, () => new Promise(() => {})),
          ...betaNotServed,
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
          discovery,
          http.get(collectionUrl, () => HttpResponse.error()),
          ...betaNotServed,
        ],
      },
    },
  },
};
