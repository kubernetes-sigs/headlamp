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

import Box from '@mui/material/Box';
import { Meta, StoryFn } from '@storybook/react';
import type { KubeObject } from '../../../lib/k8s/KubeObject';
import type { RevisionInfo } from '../../../lib/k8s/rollback';
import { TestContext } from '../../../test';
import RevisionHistorySection from './RevisionHistorySection';

const sampleRevisions: RevisionInfo[] = [
  {
    revision: 3,
    createdAt: '2023-01-03T09:30:00Z',
    images: ['registry.k8s.io/nginx:1.25.3'],
    isCurrent: true,
  },
  {
    revision: 2,
    createdAt: '2023-01-02T14:10:00Z',
    images: ['registry.k8s.io/nginx:1.25.2'],
    isCurrent: false,
  },
  {
    revision: 1,
    createdAt: '2023-01-01T08:00:00Z',
    images: ['registry.k8s.io/nginx:1.25.1', 'registry.k8s.io/sidecar:0.4.0'],
    isCurrent: false,
  },
];

function makeResource(uid: string, getRevisionHistory: () => Promise<RevisionInfo[]>): KubeObject {
  return {
    metadata: {
      name: 'my-deployment',
      namespace: 'default',
      uid,
      resourceVersion: '1',
    },
    getRevisionHistory,
  } as unknown as KubeObject;
}

export default {
  title: 'Resource/RevisionHistorySection',
  component: RevisionHistorySection,
  decorators: [
    Story => (
      <TestContext>
        <Box sx={{ p: 2, maxWidth: 720 }}>
          <Story />
        </Box>
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<{ resource: KubeObject }> = args => <RevisionHistorySection {...args} />;

export const WithHistory = Template.bind({});
WithHistory.args = {
  resource: makeResource('with-history', () => Promise.resolve(sampleRevisions)),
};
WithHistory.storyName = 'With revision history';

export const SingleRevision = Template.bind({});
SingleRevision.args = {
  resource: makeResource('single-revision', () =>
    Promise.resolve([
      {
        revision: 1,
        createdAt: '2023-01-01T08:00:00Z',
        images: ['registry.k8s.io/nginx:1.25.1'],
        isCurrent: true,
      },
    ])
  ),
};
SingleRevision.storyName = 'Single (current) revision';

export const Empty = Template.bind({});
Empty.args = {
  resource: makeResource('empty', () => Promise.resolve([])),
};
Empty.storyName = 'No revisions';

export const Loading = Template.bind({});
Loading.args = {
  resource: makeResource('loading', () => new Promise<RevisionInfo[]>(() => {})),
};
Loading.storyName = 'Loading';

export const ErrorState = Template.bind({});
ErrorState.args = {
  resource: makeResource('error', () =>
    Promise.reject(new Error('Forbidden: cannot list ReplicaSets in namespace "default"'))
  ),
};
ErrorState.storyName = 'Error loading history';

export const ManyRevisions = Template.bind({});
ManyRevisions.args = {
  resource: makeResource('many-revisions', () =>
    Promise.resolve(
      Array.from({ length: 8 }, (_, i) => {
        const revision = 8 - i;
        return {
          revision,
          createdAt: `2023-01-${String(revision).padStart(2, '0')}T08:00:00Z`,
          images: [`registry.k8s.io/nginx:1.25.${revision}`],
          isCurrent: i === 0,
        };
      })
    )
  ),
};
ManyRevisions.storyName = 'Many revisions';
