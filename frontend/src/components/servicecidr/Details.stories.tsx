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
import ServiceCIDRDetails from './Details';
import { allowsActions, collection, collectionUrl, serviceCIDR } from './storyHelper';

const meta = {
  title: 'ServiceCIDR/Details',
  component: ServiceCIDRDetails,
  args: { name: serviceCIDR.metadata.name, cluster: 'main' },
  decorators: [
    (Story, { args }) => (
      <TestContext routerMap={{ cluster: 'main', name: args.name! }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
} satisfies Meta<typeof ServiceCIDRDetails>;
export default meta;

type Story = StoryObj<typeof meta>;

const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

export const DualStack: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          allowsActions,
          collection,
          http.get(detailsUrl(serviceCIDR.metadata.name), () => HttpResponse.json(serviceCIDR)),
        ],
      },
    },
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('10.96.0.0/12, fd00:1234::/108')).toBeVisible();
        expect(screen.getByText('Conditions')).toBeVisible();
        expect(screen.getByText('True')).toBeVisible();
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
          collection,
          http.get(detailsUrl(serviceCIDR.metadata.name), () => new Promise(() => {})),
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
          collection,
          http.get(detailsUrl(serviceCIDR.metadata.name), () => HttpResponse.error()),
        ],
      },
    },
  },
};
