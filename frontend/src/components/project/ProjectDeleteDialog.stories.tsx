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
import { screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { TestContext } from '../../test';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';
import { PROJECT_ID_LABEL } from './projectUtils';

const mockProject = {
  id: 'test-project',
  namespaces: ['ns1', 'ns2'],
} as any;

const makeMockNamespace = (name: string) => ({
  metadata: { name },
  jsonData: {
    metadata: { name, labels: { [PROJECT_ID_LABEL]: 'test-project' } },
  },
  getAuthorization: async () => ({ status: { allowed: true } }),
  update: async () => {},
  delete: async () => {},
});

const mockNamespaces = [makeMockNamespace('ns1'), makeMockNamespace('ns2')];

export default {
  title: 'project/ProjectDeleteDialog',
  component: ProjectDeleteDialog,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<any> = args => <ProjectDeleteDialog {...args} />;

export const OpenDefault = Template.bind({});
OpenDefault.args = {
  open: true,
  project: mockProject,
  onClose: () => {},
  namespaces: mockNamespaces,
};

export const OpenDeleteNamespaces = Template.bind({});
OpenDeleteNamespaces.args = {
  open: true,
  project: mockProject,
  onClose: () => {},
  namespaces: mockNamespaces,
};
OpenDeleteNamespaces.parameters = {
  storyshots: { disable: true },
};
OpenDeleteNamespaces.play = async () => {
  const checkbox = await screen.findByRole('checkbox');
  await userEvent.click(checkbox);
};

export const Closed = Template.bind({});
Closed.args = {
  open: false,
  project: mockProject,
  onClose: () => {},
  namespaces: mockNamespaces,
};
