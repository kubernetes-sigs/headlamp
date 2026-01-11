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
import { PRBuildsSettings } from './PRBuildsSettings';

const mockPRInfo = {
  number: 123,
  title: 'Add new feature for Kubernetes management',
  author: 'contributor',
  authorAvatarUrl: 'https://github.com/contributor.png',
  headSha: 'abc123def456',
  headRef: 'feature-branch',
  commitDate: '2025-01-10T12:00:00Z',
  commitMessage: 'Add new feature for improved Kubernetes management',
  workflowRunId: 456789,
  availableArtifacts: [
    {
      name: 'dmgs',
      id: 1,
      size: 100000000,
      expired: false,
    },
  ],
};

const meta: Meta<typeof PRBuildsSettings> = {
  title: 'Settings/PRBuildsSettings',
  component: PRBuildsSettings,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

const Template: StoryFn<typeof PRBuildsSettings> = () => {
  // Mock the window.desktopApi for Storybook
  (window as any).desktopApi = {
    prBuilds: {
      fetchPRList: async () => ({
        success: true,
        data: [mockPRInfo],
      }),
      activatePRBuild: async () => ({
        success: true,
      }),
      clearPRBuild: async () => ({
        success: true,
      }),
      getActivePRBuild: async () => ({
        success: true,
        data: null,
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const Default = Template.bind({});

export const LoadingState: StoryFn<typeof PRBuildsSettings> = () => {
  (window as any).desktopApi = {
    prBuilds: {
      fetchPRList: async () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, data: [mockPRInfo] }), 10000)
        ),
      getActivePRBuild: async () => ({
        success: true,
        data: null,
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const WithActivePRBuild: StoryFn<typeof PRBuildsSettings> = () => {
  (window as any).desktopApi = {
    prBuilds: {
      fetchPRList: async () => ({
        success: true,
        data: [mockPRInfo],
      }),
      activatePRBuild: async () => ({
        success: true,
      }),
      clearPRBuild: async () => ({
        success: true,
      }),
      getActivePRBuild: async () => ({
        success: true,
        data: mockPRInfo,
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const ErrorState: StoryFn<typeof PRBuildsSettings> = () => {
  (window as any).desktopApi = {
    prBuilds: {
      fetchPRList: async () => ({
        success: false,
        error: 'Failed to fetch PR list from GitHub API',
      }),
      getActivePRBuild: async () => ({
        success: true,
        data: null,
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const EmptyPRList: StoryFn<typeof PRBuildsSettings> = () => {
  (window as any).desktopApi = {
    prBuilds: {
      fetchPRList: async () => ({
        success: true,
        data: [],
      }),
      getActivePRBuild: async () => ({
        success: true,
        data: null,
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const Disabled: StoryFn<typeof PRBuildsSettings> = () => {
  (window as any).desktopApi = {
    prBuilds: {
      getEnabled: async () => ({
        success: true,
        data: false,
      }),
    },
  };

  return <PRBuildsSettings />;
};
