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
import CreateJobSetForm, { CreateJobSetFormProps, JobSetDraft } from './CreateJobSetForm';

export default {
  title: 'JobSets/CreateJobSetForm',
  component: CreateJobSetForm,
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
const Template: StoryFn<CreateJobSetFormProps> = args => {
  const [resource, setResource] = React.useState<JobSetDraft | undefined>(args.resource);
  return (
    <CreateJobSetForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Brand-new JobSet, matching `JobSet.getBaseObject()`. */
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'jobset.x-k8s.io/v1alpha2',
    kind: 'JobSet',
    metadata: {
      name: '',
      namespace: '',
      labels: { app: 'headlamp' },
    },
    spec: {
      replicatedJobs: [
        {
          name: 'workers',
          replicas: 1,
          template: {
            spec: {
              parallelism: 1,
              completions: 1,
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
                },
              },
            },
          },
        },
      ],
    },
  },
};

/** Pre-filled with realistic values. */
export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'jobset.x-k8s.io/v1alpha2',
    kind: 'JobSet',
    metadata: {
      name: 'training',
      namespace: 'default',
      labels: { app: 'headlamp' },
    },
    spec: {
      replicatedJobs: [
        {
          name: 'workers',
          replicas: 4,
          template: {
            spec: {
              parallelism: 2,
              completions: 2,
              template: {
                metadata: { labels: { app: 'headlamp', tier: 'training' } },
                spec: {
                  containers: [
                    {
                      name: 'worker',
                      image: 'busybox:1.36',
                      command: ['sleep', '30'],
                      imagePullPolicy: 'IfNotPresent',
                    },
                  ],
                  restartPolicy: 'OnFailure',
                },
              },
            },
          },
        },
      ],
    },
  },
};

/** No resource passed in. Containers stay empty. */
export const Empty = Template.bind({});
Empty.args = {
  resource: undefined,
};
