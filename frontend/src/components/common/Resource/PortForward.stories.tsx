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
import React from 'react';
import { TestContext } from '../../../test';
import PortForward from './PortForward';

const meta: Meta<typeof PortForward> = {
  title: 'Resource/PortForward',
  component: PortForward,
  parameters: {
    docs: {
      description: {
        component:
          'A component for managing port forwarding for Kubernetes resources. Only renders in Electron (desktop) environment.',
      },
    },
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PortForward>;

const mockPodResource = {
  kind: 'Pod',
  cluster: 'cluster1',
  metadata: {
    name: 'my-pod',
    namespace: 'default',
  },
  status: {
    phase: 'Running',
  },
} as any;

export const PortForwardForm: Story = {
  name: 'Port forward form',
  args: {
    containerPort: 8080,
    resource: mockPodResource,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the port forward button. Note: PortForward only renders in Electron (desktop) environment — in browser it returns null.',
      },
    },
  },
};

export const ConnectionPending: Story = {
  name: 'Connection pending loading state',
  args: {
    containerPort: 3000,
    resource: mockPodResource,
  },
  parameters: {
    docs: {
      description: {
        story: 'Loading state shown while port forward connection is being established.',
      },
    },
  },
};

export const ConnectionEstablished: Story = {
  name: 'Connection established success',
  args: {
    containerPort: 8080,
    resource: mockPodResource,
  },
  parameters: {
    docs: {
      description: {
        story: 'Success state when port forward is running — shows clickable localhost link.',
      },
    },
  },
};

export const ConnectionFailed: Story = {
  name: 'Connection failed error state',
  args: {
    containerPort: 8080,
    resource: mockPodResource,
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state shown when port forward connection fails.',
      },
    },
  },
};

export const PortAlreadyInUse: Story = {
  name: 'Port already in use error',
  args: {
    containerPort: 8080,
    resource: mockPodResource,
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state when the requested local port is already in use.',
      },
    },
  },
};
