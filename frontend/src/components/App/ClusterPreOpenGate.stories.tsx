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

import { Meta, StoryObj } from '@storybook/react';
import { TestContext } from '../../test';
import { ClusterPreOpenStatus } from './ClusterPreOpenGate';

export default {
  title: 'App/ClusterPreOpenStatus',
  component: ClusterPreOpenStatus,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} satisfies Meta<typeof ClusterPreOpenStatus>;

const pending = {
  enabled: true,
  isSuccess: false,
  isError: false,
  error: null,
  retry: () => {},
};

export const Preparing: StoryObj<typeof ClusterPreOpenStatus> = {
  args: {
    cluster: 'destination-cluster',
    preOpen: { ...pending, message: 'Starting proxy…' },
  },
};

export const Failed: StoryObj<typeof ClusterPreOpenStatus> = {
  args: {
    cluster: 'destination-cluster',
    preOpen: {
      ...pending,
      isError: true,
      error: 'Proxy exited with code 1\nstderr: could not connect to the cluster',
    },
  },
};
