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
import { EnvVarGrid } from './EnvVarGrid';

export default {
  component: EnvVarGrid,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    namespace: { control: 'text' },
    cluster: { control: 'text' },
  },
} as Meta;

const Template: StoryFn<React.ComponentProps<typeof EnvVarGrid>> = args => <EnvVarGrid {...args} />;

export const PlainValues = Template.bind({});
PlainValues.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'DEBUG', value: 'true' },
  ],
};

export const ComplexReferences = Template.bind({});
ComplexReferences.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: [
    { name: 'DB_HOST', value: '127.0.0.1' },
    {
      name: 'API_KEY',
      valueFrom: {
        secretKeyRef: { name: 'my-secret', key: 'api-key' },
      },
    },
    {
      name: 'APP_CONFIG',
      valueFrom: {
        configMapKeyRef: { name: 'app-config', key: 'config.json' },
      },
    },
    {
      name: 'MY_POD_IP',
      valueFrom: {
        fieldRef: { fieldPath: 'status.podIP' },
      },
    },
    {
      name: 'CPU_LIMIT',
      valueFrom: {
        resourceFieldRef: { resource: 'limits.cpu' },
      },
    },
  ],
};

export const ManyVariables = Template.bind({});
ManyVariables.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: Array.from({ length: 35 }, (_, i) => ({
    name: `VAR_${i}`,
    value: `value-${i}`,
  })),
};
