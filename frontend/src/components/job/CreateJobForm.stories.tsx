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
import CreateJobForm, { CreateJobFormProps, JobDraft } from './CreateJobForm';

export default {
  title: 'Jobs/CreateJobForm',
  component: CreateJobForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

/** Wraps the form in local state so user edits show up in the preview.
 *  `onChange` is still forwarded to the Actions panel. */
const Template: StoryFn<CreateJobFormProps> = args => {
  const [resource, setResource] = React.useState<JobDraft | undefined>(args.resource);
  return (
    <CreateJobForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Brand-new Job, matching `Job.getBaseObject()`. Jobs don't take a
 *  user-supplied selector or a replica count. */
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: '',
      namespace: '',
      labels: { app: 'headlamp' },
    },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              command: [],
              imagePullPolicy: 'Always',
            },
          ],
          restartPolicy: 'Never',
          nodeName: '',
        },
      },
    },
  },
};

/** Pre-filled with valid values, including completions, parallelism and
 *  backoffLimit. */
export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'my-job',
      namespace: 'default',
      labels: { app: 'headlamp' },
    },
    spec: {
      completions: 5,
      parallelism: 2,
      backoffLimit: 4,
      template: {
        metadata: { labels: { app: 'headlamp' } },
        spec: {
          containers: [
            {
              name: 'worker',
              image: 'busybox:1.36',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'IfNotPresent',
            },
          ],
          restartPolicy: 'Never',
        },
      },
    },
  },
};

/** Pod template with a couple of user-supplied labels. */
export const PodTemplateExtras = Template.bind({});
PodTemplateExtras.args = {
  resource: {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'with-extras', namespace: 'default' },
    spec: {
      completions: 1,
      template: {
        metadata: { labels: { app: 'headlamp', tier: 'batch' } },
        spec: {
          containers: [{ name: 'worker', image: 'busybox:1.36' }],
          restartPolicy: 'OnFailure',
        },
      },
    },
  },
};

/** No resource passed in. Containers stay empty. */
export const Empty = Template.bind({});
Empty.args = {
  resource: undefined,
};
