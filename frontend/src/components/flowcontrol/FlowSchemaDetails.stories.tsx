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
import FlowSchemaDetails from './FlowSchemaDetails';
import { FLOW_SCHEMA_DUMMY_DATA, flowSchemaList, flowSchemaUrl } from './flowSchemaStoryHelper';
import { allowsActions } from './priorityLevelStoryHelper';

const [exempt, leaderElection, dangling] = FLOW_SCHEMA_DUMMY_DATA;

const meta = {
  title: 'FlowControl/FlowSchemaDetails',
  component: FlowSchemaDetails,
  args: { cluster: 'main', name: leaderElection.metadata.name },
  decorators: [
    (Story, { args }) => (
      <TestContext routerMap={{ cluster: 'main', name: args.name! }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
} satisfies Meta<typeof FlowSchemaDetails>;
export default meta;

type Story = StoryObj<typeof meta>;
const collection = http.get(flowSchemaUrl, () => flowSchemaList(FLOW_SCHEMA_DUMMY_DATA));
const detailsUrl = (name: string) => `${flowSchemaUrl}/${name}`;

function mswFor(name: string, respond: () => Response | Promise<Response>) {
  return { handlers: { story: [allowsActions, collection, http.get(detailsUrl(name), respond)] } };
}

export const LeaderElection: Story = {
  parameters: {
    msw: mswFor(leaderElection.metadata.name, () => HttpResponse.json(leaderElection)),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('kube-system/*')).toBeVisible();
        expect(screen.getByText('system:kube-scheduler')).toBeVisible();
        expect(screen.getByText('coordination.k8s.io')).toBeVisible();
        expect(screen.getByText('leases')).toBeVisible();
        expect(screen.getByText('Cluster Scope')).toBeVisible();
        expect(screen.getByRole('link', { name: 'leader-election' })).toHaveAttribute(
          'href',
          '/c/main/prioritylevelconfigurations/leader-election'
        );
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
        expect(screen.getByText('system:masters')).toBeVisible();
        expect(screen.getByText('Yes')).toBeVisible();
      },
    },
  },
};

export const Dangling: Story = {
  args: { name: dangling.metadata.name },
  parameters: {
    msw: mswFor(dangling.metadata.name, () => HttpResponse.json(dangling)),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('/healthz, /readyz')).toBeVisible();
        expect(screen.getByText('NotFound')).toBeVisible();
        expect(screen.getByText('batch-low')).toBeVisible();
        expect(screen.queryByRole('link', { name: 'batch-low' })).toBeNull();
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storyshots: { disable: true },
    msw: mswFor(leaderElection.metadata.name, () => new Promise(() => {})),
  },
};

export const Error: Story = {
  parameters: { msw: mswFor(leaderElection.metadata.name, () => HttpResponse.error()) },
};
