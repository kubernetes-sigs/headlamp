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
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { TestContext } from '../../test';
import { EmptyResults } from './EmptyResults';

export default {
  title: 'AdvancedSearch/EmptyResults',
  component: EmptyResults,
  argTypes: {},
} as Meta;

const Template: StoryFn<{
  resources: ApiResource[];
  onQuerySelected: (resources: ApiResource[], query: string) => void;
}> = args => (
  <TestContext>
    <EmptyResults {...args} />
  </TestContext>
);

export const Default = Template.bind({});
Default.args = {
  resources: [
    {
      kind: 'Pod',
      groupName: 'core',
      pluralName: 'pods',
      isNamespaced: true,
      apiVersion: 'v1',
      version: 'v1',
      singularName: 'pod',
    },
    {
      kind: 'Deployment',
      groupName: 'apps',
      pluralName: 'deployments',
      isNamespaced: true,
      apiVersion: 'v1',
      version: 'v1',
      singularName: 'deployment',
    },
  ],
  onQuerySelected: () => {},
};
