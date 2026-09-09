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
import { ManagerInfo } from './api';
import InstalledPlugins, { InstalledPluginsProps } from './InstalledPlugins';

const info: ManagerInfo = {
  enabled: true,
  namespace: 'headlamp',
  configMapName: 'headlamp-plugin-manager',
  state: {
    catalogs: [],
    plugins: [
      {
        name: 'flux',
        version: '1.0.0',
        archiveUrl: 'https://nexus.example/flux.tgz',
        checksum: 'c',
      },
      {
        name: 'trivy',
        version: '2.0.0',
        archiveUrl: 'https://nexus.example/trivy.tgz',
        checksum: 'c',
      },
      {
        name: 'keda',
        version: '0.1.0',
        archiveUrl: 'https://nexus.example/keda.tgz',
        checksum: 'c',
      },
      {
        name: 'kompose',
        version: '3.0.0',
        archiveUrl: 'https://nexus.example/k.tgz',
        checksum: 'c',
      },
    ],
  },
  status: {
    configMapFound: true,
    plugins: {
      flux: { phase: 'synced', version: '1.0.0' },
      trivy: { phase: 'pending' },
      keda: { phase: 'error', error: 'checksum mismatch' },
    },
  },
};

export default {
  title: 'PluginManager/InstalledPlugins',
  component: InstalledPlugins,
} as Meta;

const Template: StoryFn<InstalledPluginsProps> = args => (
  <TestContext>
    <InstalledPlugins {...args} />
  </TestContext>
);

export const MixedStatuses = Template.bind({});
MixedStatuses.args = { info, onChanged: () => {} };
MixedStatuses.parameters = { msw: { handlers: [] } };

export const Empty = Template.bind({});
Empty.args = {
  info: {
    ...info,
    state: { catalogs: [], plugins: [] },
    status: { configMapFound: true, plugins: {} },
  },
  onChanged: () => {},
};
Empty.parameters = { msw: { handlers: [] } };
