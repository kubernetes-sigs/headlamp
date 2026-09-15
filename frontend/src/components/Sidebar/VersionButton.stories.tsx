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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import React from 'react';
import reducers from '../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../test';
import { initialState as sidebarInitialState } from './sidebarSlice';
import VersionButton from './VersionButton';

// Version served to the real Storybook UI (the snapshot test mocks clusterRequest
// separately, so this only affects `npm run storybook`). Fixed values keep the
// version dialog deterministic when viewed there.
const CLUSTER_VERSION = {
  gitVersion: 'v1.28.0',
  gitCommit: '855e7c48de7388eb330da0f8d9d2394ee818fb8d',
  gitTreeState: 'clean',
  goVersion: 'go1.20.5',
  platform: 'linux/amd64',
};

// The sidebar's default open state depends on window width, so pin it explicitly
// per story to keep the collapsed/expanded snapshots stable.
function withSidebarOpen(isSidebarOpen: boolean) {
  const store = configureStore({
    reducer: reducers,
    preloadedState: { sidebar: { ...sidebarInitialState, isSidebarOpen } },
  });
  return (Story: React.ComponentType) => (
    <TestContext store={store}>
      <Story />
    </TestContext>
  );
}

const meta: Meta<typeof VersionButton> = {
  title: 'Sidebar/VersionButton',
  component: VersionButton,
  parameters: {
    msw: {
      handlers: {
        story: [http.get(`${API_BASE}/version`, () => HttpResponse.json(CLUSTER_VERSION))],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof VersionButton>;

export const Default: Story = {
  decorators: [withSidebarOpen(true)],
};

export const CollapsedSidebar: Story = {
  decorators: [withSidebarOpen(false)],
};
