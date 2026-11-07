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
import { delay, http, HttpResponse } from 'msw';
import React from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import PortForward, { PortForwardState } from './PortForward';

// Dummy Pod Resource
const mockPodResource: KubeObject = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'my-pod',
    namespace: 'default',
    uid: '1234',
  },
  cluster: 'my-cluster',
  status: {
    phase: 'Running',
  },
} as unknown as KubeObject;

const originalProcess = typeof window !== 'undefined' ? (window as any).process : undefined;

const meta: Meta<typeof PortForward> = {
  title: 'common/Resource/PortForward',
  component: PortForward,
  decorators: [
    Story => {
      React.useEffect(() => {
        return () => {
          if (typeof window !== 'undefined') {
            (window as any).process = originalProcess;
          }
        };
      }, []);

      if (typeof window !== 'undefined') {
        (window as any).process = { ...(originalProcess || {}), type: 'renderer' };
      }

      // Clear localStorage so state doesn't leak between stories
      localStorage.removeItem('portforwards');
      return (
        <TestContext>
          <div style={{ padding: '20px' }}>
            <Story />
          </div>
        </TestContext>
      );
    },
  ],
  args: {
    resource: mockPodResource,
    containerPort: 8080,
  },
};

export default meta;
type Story = StoryObj<typeof PortForward>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('*/clusters/my-cluster/portforward/list', () => HttpResponse.json([])),
          http.get('*/api/v1/namespaces/default/pods', () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storyshots: { disable: true },
    msw: {
      handlers: {
        story: [
          // Delay indefinitely to show the loading state
          http.get('*/clusters/my-cluster/portforward/list', async () => {
            await delay('infinite');
            return HttpResponse.json([]);
          }),
          http.get('*/api/v1/namespaces/default/pods', () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
};

const activePortForward: PortForwardState = {
  id: 'pf-123',
  pod: 'my-pod',
  service: '',
  serviceNamespace: 'default',
  namespace: 'default',
  cluster: 'my-cluster',
  port: '8080',
  targetPort: '8080',
  status: 'Running',
};

export const Success: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('*/clusters/my-cluster/portforward/list', () =>
            HttpResponse.json([activePortForward])
          ),
          http.get('*/api/v1/namespaces/default/pods', () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
};

export const ErrorConnectionFailed: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('*/clusters/my-cluster/portforward/list', () => {
            return new HttpResponse(
              JSON.stringify({ message: 'Network error connecting to cluster' }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }),
          http.get('*/api/v1/namespaces/default/pods', () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
};

export const PortAlreadyInUse: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('*/clusters/my-cluster/portforward/list', () => {
            return new HttpResponse(JSON.stringify({ message: 'Port 8080 is already in use' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }),
          http.get('*/api/v1/namespaces/default/pods', () => HttpResponse.json({ items: [] })),
        ],
      },
    },
  },
};
