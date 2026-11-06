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
import { TestContext } from '../../../test';
import { LAST_APPLIED_ANNOTATION } from './lastAppliedConfiguration';
import LastAppliedDiff from './LastAppliedDiff';

export default {
  title: 'Resource/LastAppliedDiff',
  component: LastAppliedDiff,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const applied = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { annotations: {}, name: 'nginx-deployment', namespace: 'default' },
  spec: {
    replicas: 2,
    selector: { matchLabels: { app: 'nginx' } },
    template: {
      metadata: { labels: { app: 'nginx' } },
      spec: { containers: [{ name: 'nginx', image: 'nginx:1.25' }] },
    },
  },
};

function makeDeployment(spec: object, annotation: string | null = JSON.stringify(applied)) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'nginx-deployment',
      namespace: 'default',
      uid: '12345',
      resourceVersion: '1',
      creationTimestamp: '2025-06-11T10:00:00Z',
      generation: 2,
      annotations: {
        'deployment.kubernetes.io/revision': '2',
        ...(annotation === null ? {} : { [LAST_APPLIED_ANNOTATION]: annotation }),
      },
    },
    spec,
    status: { replicas: 2 },
  };
}

const Template: StoryFn<typeof LastAppliedDiff> = args => <LastAppliedDiff {...args} />;

export const InSync = Template.bind({});
InSync.args = {
  item: makeDeployment({ ...applied.spec, progressDeadlineSeconds: 600 }),
};

export const Drifted = Template.bind({});
Drifted.args = {
  item: makeDeployment({
    ...applied.spec,
    replicas: 5,
    template: {
      ...applied.spec.template,
      spec: {
        containers: [
          { name: 'nginx', image: 'nginx:1.26' },
          { name: 'istio-proxy', image: 'istio/proxyv2:1.22' },
        ],
      },
    },
  }),
};

/** Nothing is rendered when the annotation cannot be parsed. */
export const InvalidAnnotation = Template.bind({});
InvalidAnnotation.args = {
  item: makeDeployment(applied.spec, '{not json'),
};

/** Nothing is rendered for resources without the annotation, e.g. created with server-side apply. */
export const NoAnnotation = Template.bind({});
NoAnnotation.args = {
  item: makeDeployment(applied.spec, null),
};
