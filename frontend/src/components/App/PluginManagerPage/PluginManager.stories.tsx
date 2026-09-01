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
import PluginManager from './PluginManager';

const enabledInfo = {
  enabled: true,
  namespace: 'headlamp',
  configMapName: 'headlamp-plugin-manager',
  state: { catalogs: [], plugins: [] },
  status: { configMapFound: true, plugins: {} },
};

export default {
  title: 'PluginManager/PluginManager',
  component: PluginManager,
} as Meta;

const Template: StoryFn = () => (
  <TestContext>
    <PluginManager />
  </TestContext>
);

export const Enabled = Template.bind({});
Enabled.parameters = {
  msw: {
    handlers: [http.get(`${API_BASE}/plugin-manager`, () => HttpResponse.json(enabledInfo))],
  },
};

export const Disabled = Template.bind({});
Disabled.parameters = {
  msw: {
    handlers: [
      http.get(`${API_BASE}/plugin-manager`, () => new HttpResponse(null, { status: 404 })),
    ],
  },
};

export const WithSyncError = Template.bind({});
WithSyncError.parameters = {
  msw: {
    handlers: [
      http.get(`${API_BASE}/plugin-manager`, () =>
        HttpResponse.json({
          ...enabledInfo,
          status: { configMapFound: false, plugins: {}, error: 'catalog unreachable' },
        })
      ),
    ],
  },
};
