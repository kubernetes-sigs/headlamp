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
import CreateStatefulSetForm, {
  CreateStatefulSetFormProps,
  StatefulSetDraft,
} from './CreateStatefulSetForm';

export default {
  title: 'StatefulSet/CreateStatefulSetForm',
  component: CreateStatefulSetForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateStatefulSetFormProps> = args => {
  const [resource, setResource] = React.useState<StatefulSetDraft | undefined>(args.resource);
  return (
    <CreateStatefulSetForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

/** Default base object matching `StatefulSet.getBaseObject()`. */
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: '',
      namespace: '',
    },
    spec: {
      selector: { matchLabels: { app: 'headlamp' } },
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 0 },
      },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
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
    kind: 'StatefulSet',
    metadata: {
      name: 'my-statefulset',
      namespace: 'default',
    },
    spec: {
      selector: { matchLabels: { app: 'headlamp' } },
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 2 },
      },
      template: {
        metadata: { labels: { app: 'headlamp' } },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'nginx:1.27',
              imagePullPolicy: 'IfNotPresent',
            },
          ],
          nodeName: 'worker-1',
        },
      },
    },
  },
};

/** OnDelete strategy — partition field should be hidden. */
export const OnDeleteStrategy = Template.bind({});
OnDeleteStrategy.args = {
  resource: {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'on-delete-sts',
      namespace: 'default',
    },
    spec: {
      selector: { matchLabels: { app: 'headlamp' } },
      updateStrategy: {
        type: 'OnDelete',
      },
      template: {
        spec: {
          containers: [{ name: 'app', image: 'redis:7' }],
        },
      },
    },
  },
};

/** No resource passed — tests seed behavior. */
export const Empty = Template.bind({});
Empty.args = {
  resource: undefined,
};
