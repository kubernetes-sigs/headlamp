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

import type { Meta, StoryObj } from '@storybook/react';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { TestContext } from '../../test';
import {
  ClusterGroupErrorMessage,
  ClusterGroupErrorMessageProps,
} from './ClusterGroupErrorMessage';

const meta: Meta<typeof ClusterGroupErrorMessage> = {
  component: ClusterGroupErrorMessage,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
};

export default meta;
type Story = StoryObj<ClusterGroupErrorMessageProps>;

export const WithClusterErrors: Story = {
  args: {
    errors: [
      new ApiError('Error in cluster 1', { cluster: 'cluster1' }),
      new ApiError('Error in cluster 3', { cluster: 'cluster3' }),
    ],
  },
};

export const WithMutipleErrorsPerCluster: Story = {
  args: {
    errors: [
      new ApiError('Error A in cluster 1', { cluster: 'cluster1' }),
      new ApiError('Error B in cluster 1', { cluster: 'cluster1' }),
    ],
  },
};
