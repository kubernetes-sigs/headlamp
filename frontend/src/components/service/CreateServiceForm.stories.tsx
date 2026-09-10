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
import CreateServiceForm, { CreateServiceFormProps, ServiceDraft } from './CreateServiceForm';

export default {
  title: 'Service/CreateServiceForm',
  component: CreateServiceForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateServiceFormProps> = args => {
  const [resource, setResource] = React.useState<ServiceDraft | undefined>(args.resource);
  return (
    <CreateServiceForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

// Matches `Service.getBaseObject()`.
export const Default = Template.bind({});
Default.args = {
  resource: {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: '',
      namespace: '',
    },
    spec: {
      clusterIP: '',
      ports: [
        {
          name: '',
          nodePort: 30000,
          port: 80,
          protocol: 'TCP',
          targetPort: 80,
        },
      ],
      type: 'ClusterIP',
      externalIPs: [],
      selector: {},
    },
  },
};
