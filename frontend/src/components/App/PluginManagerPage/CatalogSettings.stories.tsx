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
import CatalogSettings, { CatalogSettingsProps } from './CatalogSettings';

const info: ManagerInfo = {
  enabled: true,
  namespace: 'headlamp',
  configMapName: 'headlamp-plugin-manager',
  state: {
    catalogs: [
      {
        id: 'artifacthub',
        name: 'Artifact Hub',
        type: 'artifacthub',
        url: 'https://artifacthub.io',
      },
      {
        id: 'nexus',
        name: 'Nexus',
        type: 'index',
        url: 'https://nexus.example/repository/plugins/index.json',
        insecureSkipTlsVerify: true,
        username: 'jan',
        passwordSecret: 'headlamp-catalog-nexus',
      },
    ],
    plugins: [],
  },
  status: { configMapFound: true, plugins: {} },
};

export default {
  title: 'PluginManager/CatalogSettings',
  component: CatalogSettings,
} as Meta;

const Template: StoryFn<CatalogSettingsProps> = args => (
  <TestContext>
    <CatalogSettings {...args} />
  </TestContext>
);

export const WithCatalogs = Template.bind({});
WithCatalogs.args = { info, onChanged: () => {} };
WithCatalogs.parameters = { msw: { handlers: [] } };

export const Empty = Template.bind({});
Empty.args = {
  info: { ...info, state: { catalogs: [], plugins: [] } },
  onChanged: () => {},
};
Empty.parameters = { msw: { handlers: [] } };
