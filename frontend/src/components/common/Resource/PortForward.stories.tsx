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
import React from 'react';
import Pod, { KubePod } from '../../../lib/k8s/pod';
import Service, { KubeService } from '../../../lib/k8s/service';
import { TestContext } from '../../../test';
import PortForward, { PORT_FORWARDS_STORAGE_KEY } from './PortForward';

export default {
  title: 'Resource/PortForward',
  component: PortForward,
  decorators: [
    Story => {
      if (typeof window !== 'undefined') {
        (window as any).process = { ...(window as any).process, type: 'renderer' };
      }
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const mockPod = new Pod({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: 'nginx-pod',
    namespace: 'default',
    uid: 'mock-pod-uid',
    creationTimestamp: new Date().toISOString(),
  },
  spec: {
    containers: [
      {
        name: 'nginx',
        image: 'nginx:latest',
        ports: [{ containerPort: 80 }],
        imagePullPolicy: 'Always',
      },
    ],
  },
  status: {
    phase: 'Running',
    conditions: [],
    containerStatuses: [],
    startTime: new Date().toISOString(),
  },
} as unknown as KubePod);

const mockService = new Service({
  apiVersion: 'v1',
  kind: 'Service',
  metadata: {
    name: 'nginx-service',
    namespace: 'default',
    uid: 'mock-service-uid',
    creationTimestamp: new Date().toISOString(),
  },
  spec: {
    ports: [
      {
        name: 'http',
        port: 80,
        targetPort: 80,
        protocol: 'TCP',
      },
    ],
    selector: {
      app: 'nginx',
    },
  },
  status: {},
} as unknown as KubeService);

const Template: StoryFn<typeof PortForward> = args => <PortForward {...args} />;

export const Default = Template.bind({});
Default.args = {
  containerPort: 80,
  resource: mockPod,
};

export const Running = () => {
  React.useEffect(() => {
    localStorage.setItem(
      PORT_FORWARDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'pf-running-1',
          pod: 'nginx-pod',
          service: '',
          serviceNamespace: '',
          namespace: 'default',
          cluster: 'test-cluster',
          port: '8080',
          targetPort: '80',
          status: 'Running',
        },
      ])
    );
    return () => {
      localStorage.removeItem(PORT_FORWARDS_STORAGE_KEY);
    };
  }, []);

  return <PortForward containerPort={80} resource={mockPod} />;
};

export const Stopped = () => {
  React.useEffect(() => {
    localStorage.setItem(
      PORT_FORWARDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'pf-stopped-1',
          pod: 'nginx-pod',
          service: '',
          serviceNamespace: '',
          namespace: 'default',
          cluster: 'test-cluster',
          port: '8080',
          targetPort: '80',
          status: 'Stopped',
        },
      ])
    );
    return () => {
      localStorage.removeItem(PORT_FORWARDS_STORAGE_KEY);
    };
  }, []);

  return <PortForward containerPort={80} resource={mockPod} />;
};

export const ServicePortForward = Template.bind({});
ServicePortForward.args = {
  containerPort: 80,
  resource: mockService,
};
