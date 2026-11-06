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
import ResourceComparison from './ResourceComparison';

export default {
  title: 'Resource/ResourceComparison',
  component: ResourceComparison,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

function makeDeployment(uid: string, spec: object) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'nginx-deployment',
      namespace: 'default',
      uid,
      resourceVersion: uid === 'staging-uid' ? '10' : '20',
      creationTimestamp: '2026-01-01T10:00:00Z',
      generation: 2,
    },
    spec,
    status: { replicas: 2 },
  };
}

const spec = {
  replicas: 2,
  selector: { matchLabels: { app: 'nginx' } },
  template: {
    metadata: { labels: { app: 'nginx' } },
    spec: { containers: [{ name: 'nginx', image: 'nginx:1.25' }] },
  },
};

const Template: StoryFn<typeof ResourceComparison> = args => <ResourceComparison {...args} />;

/** Only server-populated fields differ, so the objects are reported as identical. */
export const Identical = Template.bind({});
Identical.args = {
  original: makeDeployment('staging-uid', spec),
  modified: makeDeployment('prod-uid', spec),
  originalLabel: 'staging / default / nginx-deployment',
  modifiedLabel: 'prod / default / nginx-deployment',
};

export const Different = Template.bind({});
Different.args = {
  original: makeDeployment('staging-uid', spec),
  modified: makeDeployment('prod-uid', {
    ...spec,
    replicas: 5,
    template: {
      ...spec.template,
      spec: { containers: [{ name: 'nginx', image: 'nginx:1.26' }] },
    },
  }),
  originalLabel: 'staging / default / nginx-deployment',
  modifiedLabel: 'prod / default / nginx-deployment',
};
