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
import CreateCronJobForm, { CreateCronJobFormProps, CronJobDraft } from './CreateCronJobForm';

export default {
  title: 'CronJobs/CreateCronJobForm',
  component: CreateCronJobForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateCronJobFormProps> = args => {
  const [resource, setResource] = React.useState<CronJobDraft | undefined>(args.resource);
  return (
    <CreateCronJobForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Matches CronJob.getBaseObject() defaults. */
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      name: '',
      namespace: '',
      labels: { app: 'headlamp' },
    },
    spec: {
      suspend: false,
      schedule: '',
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
      concurrencyPolicy: 'Allow',
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: '',
                  image: '',
                  imagePullPolicy: 'Always',
                },
              ],
              restartPolicy: 'Never',
            },
          },
        },
      },
    },
  } as CronJobDraft,
};

/** Pre-filled with a schedule, time zone, and a container command. */
export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      name: 'cleanup-job',
      namespace: 'default',
      labels: { app: 'headlamp' },
    },
    spec: {
      schedule: '0 2 * * *',
      timeZone: 'Etc/UTC',
      suspend: false,
      concurrencyPolicy: 'Forbid',
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
      startingDeadlineSeconds: 300,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'cleanup',
                  image: 'busybox:1.36',
                  command: ['sh', '-c', 'echo cleanup'],
                  imagePullPolicy: 'IfNotPresent',
                },
              ],
              restartPolicy: 'OnFailure',
            },
          },
        },
      },
    },
  } as CronJobDraft,
};

/** No resource passed in — all fields empty. */
export const Empty = Template.bind({});
Empty.args = {
  resource: undefined,
};
