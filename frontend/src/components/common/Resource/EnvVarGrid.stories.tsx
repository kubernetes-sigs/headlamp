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
  title: 'Resource/EnvVarGrid',
  component: EnvVarGrid,
  argTypes: {
    namespace: { control: 'text' },
    cluster: { control: 'text' },
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<React.ComponentProps<typeof EnvVarGrid>> = args => <EnvVarGrid {...args} />;

export const Default = Template.bind({});
Default.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'DEBUG', value: 'true' },
    { name: 'PLAINTEXT', value: '127.0.0.1' },
  ],
};

export const ComplexReferences = Template.bind({});
ComplexReferences.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: [
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
        fieldRef: { fieldPath: 'status.podIP', apiVersion: 'v1' },
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

export const EdgeCases = Template.bind({});
EdgeCases.args = {
  namespace: 'default',
  cluster: 'minikube',
  envVars: [
    {
      name: 'MISSING_SECRET_NAME',
      valueFrom: {
        // @ts-ignore - Testing resilience against missing data
        secretKeyRef: { key: 'some-key' },
      },
    },
    {
      name: 'MISSING_CONFIG_MAP',
      valueFrom: {
        // @ts-ignore - Testing resilience against missing data
        configMapKeyRef: { key: 'my-config' },
      },
    },
    {
      name: 'EMPTY_VALUE_FROM',
      valueFrom: {},
    },
    {
      name: 'MALFORMED_FIELD_REF',
      valueFrom: {
        fieldRef: {} as any,
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
