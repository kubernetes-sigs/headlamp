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
import { http, HttpResponse } from 'msw';
import { API_BASE, TestContext } from '../../../test';
import { ManagerInfo } from './api';
import PluginBrowser, { PluginBrowserProps } from './PluginBrowser';

const info: ManagerInfo = {
  enabled: true,
  namespace: 'headlamp',
  configMapName: 'headlamp-plugin-manager',
  state: {
    catalogs: [
      { id: 'nexus', name: 'Nexus', type: 'index', url: 'https://nexus.example/index.json' },
    ],
    plugins: [
      {
        name: 'flux',
        version: '1.0.0',
        archiveUrl: 'https://nexus.example/flux.tgz',
        checksum: 'c',
      },
    ],
  },
  status: { configMapFound: true, plugins: {} },
};

const searchResult = {
  entries: [
    {
      name: 'flux',
      displayName: 'Flux UI',
      description: 'GitOps status',
      version: '1.0.0',
      catalog: 'nexus',
      source: 'https://example.com/flux',
    },
    {
      name: 'trivy',
      displayName: 'Trivy',
      description: 'Vulnerability scanner',
      version: '2.0.0',
      catalog: 'nexus',
    },
  ],
  hasMore: false,
};

export default {
  title: 'PluginManager/PluginBrowser',
  component: PluginBrowser,
} as Meta;

const Template: StoryFn<PluginBrowserProps> = args => (
  <TestContext>
    <PluginBrowser {...args} />
  </TestContext>
);

export const Default = Template.bind({});
Default.args = { info, onChanged: () => {} };
Default.parameters = {
  msw: {
    handlers: [
      http.get(`${API_BASE}/plugin-manager/catalogs/nexus/search`, () =>
        HttpResponse.json(searchResult)
      ),
    ],
  },
};

export const NoCatalogs = Template.bind({});
NoCatalogs.args = {
  info: { ...info, state: { catalogs: [], plugins: [] } },
  onChanged: () => {},
};
NoCatalogs.parameters = { msw: { handlers: [] } };
