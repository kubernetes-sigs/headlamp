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
import Service, { KubeService } from '../../../lib/k8s/service';
import { ServiceGlance } from './ServiceGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/ServiceGlance',
  component: ServiceGlance,
} as Meta<typeof ServiceGlance>;

const Template: StoryFn<typeof ServiceGlance> = args => <ServiceGlance {...args} />;

function createService(
  spec: Partial<KubeService['spec']>,
  status: KubeService['status'] = {}
): Service {
  const json: KubeService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'my-service',
      namespace: 'default',
      uid: 'service-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    spec: {
      clusterIP: '10.96.0.10',
      externalIPs: [],
      selector: { app: 'my-app' },
      ...spec,
    } as KubeService['spec'],
    status,
  };
  return new Service(json);
}

export const ClusterIP = Template.bind({});
ClusterIP.args = {
  service: createService({
    type: 'ClusterIP',
    ports: [{ name: 'http', port: 80, protocol: 'TCP', targetPort: 8080 }],
  }),
};

export const LoadBalancer = Template.bind({});
LoadBalancer.args = {
  service: createService(
    {
      type: 'LoadBalancer',
      ports: [{ name: 'https', port: 443, protocol: 'TCP', targetPort: 8443 }],
    },
    { loadBalancer: { ingress: [{ ip: '203.0.113.10' }] } }
  ),
};

export const NodePort = Template.bind({});
NodePort.args = {
  service: createService({
    type: 'NodePort',
    ports: [
      { name: 'http', port: 80, protocol: 'TCP', targetPort: 8080, nodePort: 30080 },
      { name: 'https', port: 443, protocol: 'TCP', targetPort: 8443, nodePort: 30443 },
    ],
  }),
};

export const WithExternalIPs = Template.bind({});
WithExternalIPs.args = {
  service: createService({
    type: 'ClusterIP',
    externalIPs: ['198.51.100.20'],
    ports: [{ name: 'http', port: 80, protocol: 'TCP', targetPort: 8080 }],
  }),
};
