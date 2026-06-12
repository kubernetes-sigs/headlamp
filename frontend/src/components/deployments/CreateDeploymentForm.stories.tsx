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
import React from 'react';
import { TestContext } from '../../test';
import CreateDeploymentForm, {
  CreateDeploymentFormProps,
  DeploymentDraft,
} from './CreateDeploymentForm';

export default {
  title: 'Deployments/CreateDeploymentForm',
  component: CreateDeploymentForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

/** Wraps the form in local state so the on-mount seeds (selector,
 *  mirrored pod labels, `replicas: 1`) and user edits show up in the
 *  preview. `onChange` is still forwarded to the Actions panel. */
const Template: StoryFn<CreateDeploymentFormProps> = args => {
  const [resource, setResource] = React.useState<DeploymentDraft | undefined>(args.resource);
  return (
    <CreateDeploymentForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Brand-new Deployment, matching `Deployment.getBaseObject()`. Pod labels
 *  get seeded by mirroring the selector and replicas defaults to 1. */
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: '',
      namespace: '',
      labels: { app: 'headlamp' },
    },
    spec: {
      selector: { matchLabels: { app: 'headlamp' } },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    },
  },
};

/** Pre-filled with valid values. */
export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'my-deployment',
      namespace: 'default',
      labels: { app: 'headlamp' },
    },
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: 'headlamp' } },
      template: {
        metadata: { labels: { app: 'headlamp' } },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx:1.27',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'IfNotPresent',
            },
          ],
        },
      },
    },
  },
};

/** Pod template has the mirrored selector label plus an extra editable
 *  label (`tier=frontend`). */
export const PodTemplateExtras = Template.bind({});
PodTemplateExtras.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'with-extras', namespace: 'default' },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'headlamp' } },
      template: {
        metadata: { labels: { app: 'headlamp', tier: 'frontend' } },
        spec: {
          containers: [{ name: 'app', image: 'nginx:1.27' }],
        },
      },
    },
  },
};

/** No resource passed in. Seed fills selector + pod labels with
 *  `{ app: 'headlamp' }` and replicas with 1; containers stay empty. */
export const Empty = Template.bind({});
Empty.args = {
  resource: undefined,
};
