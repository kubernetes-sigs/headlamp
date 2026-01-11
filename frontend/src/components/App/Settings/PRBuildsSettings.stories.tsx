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
import PRBuildsSettings from './PRBuildsSettings';

const mockPRInfo = {
  number: 123,
  title: 'Add new feature for Kubernetes management',
  author: 'contributor',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
  headSha: 'abc123def456',
  headRef: 'feature-branch',
  commitDate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  commitMessage: 'Add new feature for improved Kubernetes management',
  workflowRunId: 456789,
  buildStartTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  contributors: ['contributor', 'reviewer1'],
  availableArtifacts: [
    {
      name: 'dmgs',
      id: 1,
      size: 100000000,
      expired: false,
    },
    {
      name: 'AppImages',
      id: 2,
      size: 95000000,
      expired: false,
    },
  ],
};

const mockRecentPR = {
  ...mockPRInfo,
  number: 456,
  title: 'Fix critical bug in pod management',
  author: 'maintainer',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
  headSha: 'def456abc789',
  commitDate: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
  buildStartTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  workflowRunId: 456790,
  contributors: ['maintainer'],
};

const mockOldPR = {
  ...mockPRInfo,
  number: 789,
  title: 'Update documentation for new API',
  author: 'docs-team',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/3?v=4',
  headSha: 'ghi789jkl012',
  commitDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  buildStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  workflowRunId: 456791,
  contributors: ['docs-team', 'reviewer2', 'reviewer3'],
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
      listPRBuilds: async () => ({
        success: true,
        data: [mockPRInfo, mockRecentPR, mockOldPR],
      }),
      activatePRBuild: async () => ({
        success: true,
      }),
      clearPRBuild: async () => ({
        success: true,
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
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
      listPRBuilds: async () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, data: [mockPRInfo] }), 10000)
        ),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
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
      listPRBuilds: async () => ({
        success: true,
        data: [mockPRInfo, mockRecentPR],
      }),
      activatePRBuild: async () => ({
        success: true,
      }),
      clearPRBuild: async () => ({
        success: true,
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: true, prInfo: mockPRInfo },
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const BuildInProgress: StoryFn<typeof PRBuildsSettings> = () => {
  const recentBuildPR = {
    ...mockPRInfo,
    buildStartTime: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes ago
  };

  (window as any).desktopApi = {
    prBuilds: {
      listPRBuilds: async () => ({
        success: true,
        data: [recentBuildPR],
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
      }),
      getEnabled: async () => ({
        success: true,
        data: true,
      }),
    },
  };

  return <PRBuildsSettings />;
};

export const BuildCompleted: StoryFn<typeof PRBuildsSettings> = () => {
  const completedBuildPR = {
    ...mockPRInfo,
    buildStartTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
  };

  (window as any).desktopApi = {
    prBuilds: {
      listPRBuilds: async () => ({
        success: true,
        data: [completedBuildPR, mockOldPR],
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
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
      listPRBuilds: async () => ({
        success: false,
        error: 'Failed to fetch PR list from GitHub API',
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
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
      listPRBuilds: async () => ({
        success: true,
        data: [],
      }),
      getPRBuildStatus: async () => ({
        success: true,
        data: { isActive: false, prInfo: null },
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
