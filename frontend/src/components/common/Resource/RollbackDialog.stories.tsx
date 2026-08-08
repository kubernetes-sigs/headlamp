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
import { screen } from '@testing-library/react';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import type { RevisionInfo } from '../../../lib/k8s/rollback';
import { TestContext } from '../../../test';
import type { RollbackableResource } from './RollbackButton';
import RollbackDialog from './RollbackDialog';

const revisions: RevisionInfo[] = [
  {
    revision: 4,
    createdAt: '2023-01-04T11:00:00Z',
    images: ['registry.k8s.io/nginx:1.25.4'],
    isCurrent: true,
  },
  {
    revision: 3,
    createdAt: '2023-01-03T09:30:00Z',
    images: ['registry.k8s.io/nginx:1.25.3'],
    isCurrent: false,
  },
  {
    revision: 2,
    createdAt: '2023-01-02T14:10:00Z',
    images: ['registry.k8s.io/nginx:1.25.2', 'registry.k8s.io/sidecar:0.4.0'],
    isCurrent: false,
  },
  {
    revision: 1,
    createdAt: '2023-01-01T08:00:00Z',
    images: ['registry.k8s.io/nginx:1.25.1'],
    isCurrent: false,
  },
];

const dryRunResult: KubeObjectInterface = {
  kind: 'Deployment',
  apiVersion: 'apps/v1',
  metadata: {
    name: 'nginx-deployment',
    namespace: 'default',
    uid: 'd1e2f3a4-b5c6-7890-abcd-ef0123456789',
    resourceVersion: '24680',
    creationTimestamp: '2023-01-01T08:00:00Z',
  },
  spec: {
    replicas: 3,
    template: {
      spec: {
        containers: [{ name: 'nginx', image: 'registry.k8s.io/nginx:1.25.2' }],
      },
    },
  },
};

function makeResource(rollbackImpl?: RollbackableResource['rollback']): RollbackableResource {
  return {
    rollback:
      rollbackImpl ??
      (async () => ({
        success: true,
        message: 'Dry-run succeeded',
        dryRunResult,
      })),
  } as unknown as RollbackableResource;
}

interface RollbackDialogProps {
  open: boolean;
  resourceKind: string;
  resourceName: string;
  resource: RollbackableResource;
  getRevisionHistory: () => Promise<RevisionInfo[]>;
  onClose: () => void;
  onConfirm: (toRevision?: number) => void;
}

export default {
  title: 'Resource/RollbackDialog',
  component: RollbackDialog,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    open: { control: 'boolean' },
    resourceKind: { control: 'text' },
    resourceName: { control: 'text' },
  },
} as Meta;

const Template: StoryFn<RollbackDialogProps> = args => <RollbackDialog {...args} />;

export const WithRevisions = Template.bind({});
WithRevisions.args = {
  open: true,
  resourceKind: 'Deployment',
  resourceName: 'nginx-deployment',
  resource: makeResource(),
  getRevisionHistory: () => Promise.resolve(revisions),
  onClose: () => {},
  onConfirm: () => {},
};
WithRevisions.storyName = 'With revisions';

export const OnlyCurrentRevision = Template.bind({});
OnlyCurrentRevision.args = {
  open: true,
  resourceKind: 'StatefulSet',
  resourceName: 'postgres',
  resource: makeResource(),
  getRevisionHistory: () =>
    Promise.resolve([
      {
        revision: 1,
        createdAt: '2023-01-01T08:00:00Z',
        images: ['registry.k8s.io/postgres:16.1'],
        isCurrent: true,
      },
    ]),
  onClose: () => {},
  onConfirm: () => {},
};
OnlyCurrentRevision.storyName = 'Only current revision (nothing to roll back)';

export const Loading = Template.bind({});
Loading.args = {
  open: true,
  resourceKind: 'Deployment',
  resourceName: 'nginx-deployment',
  resource: makeResource(),
  getRevisionHistory: () => new Promise<RevisionInfo[]>(() => {}),
  onClose: () => {},
  onConfirm: () => {},
};
Loading.storyName = 'Loading revision history';

export const HistoryError = Template.bind({});
HistoryError.args = {
  open: true,
  resourceKind: 'DaemonSet',
  resourceName: 'fluentd',
  resource: makeResource(),
  getRevisionHistory: () =>
    Promise.reject(new Error('the server could not find the requested resource')),
  onClose: () => {},
  onConfirm: () => {},
};
HistoryError.storyName = 'Failed to load history';

export const PreviewSuccess = Template.bind({});
PreviewSuccess.args = {
  open: true,
  resourceKind: 'Deployment',
  resourceName: 'nginx-deployment',
  resource: makeResource(),
  getRevisionHistory: () => Promise.resolve(revisions),
  onClose: () => {},
  onConfirm: () => {},
};
PreviewSuccess.storyName = 'Preview (dry-run) succeeds';
PreviewSuccess.parameters = { storyshots: { disable: true } };
PreviewSuccess.play = async () => {
  const previewButton = await screen.findByRole('button', { name: 'preview-button' });
  await waitFor(() => expect(previewButton).toBeEnabled());
  await userEvent.click(previewButton);
  await waitFor(() => expect(screen.getByText(/Dry-Run Preview/i)).toBeInTheDocument());
};

export const PreviewFails = Template.bind({});
PreviewFails.args = {
  open: true,
  resourceKind: 'Deployment',
  resourceName: 'nginx-deployment',
  resource: makeResource(async () => ({
    success: false,
    message: 'admission webhook denied the request',
  })),
  getRevisionHistory: () => Promise.resolve(revisions),
  onClose: () => {},
  onConfirm: () => {},
};
PreviewFails.storyName = 'Preview (dry-run) fails';
PreviewFails.parameters = { storyshots: { disable: true } };
PreviewFails.play = async () => {
  const previewButton = await screen.findByRole('button', { name: 'preview-button' });
  await waitFor(() => expect(previewButton).toBeEnabled());
  await userEvent.click(previewButton);
  await waitFor(() => expect(screen.getByText(/Dry-run failed/i)).toBeInTheDocument());
};

export const Closed = Template.bind({});
Closed.args = {
  open: false,
  resourceKind: 'Deployment',
  resourceName: 'nginx-deployment',
  resource: makeResource(),
  getRevisionHistory: () => Promise.resolve(revisions),
  onClose: () => {},
  onConfirm: () => {},
};
Closed.storyName = 'Closed';
