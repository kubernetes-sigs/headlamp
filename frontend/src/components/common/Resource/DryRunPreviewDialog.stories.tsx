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
import { Provider } from 'react-redux';
import type { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import store from '../../../redux/stores/store';
import DryRunPreviewDialog from './DryRunPreviewDialog';

interface DryRunPreviewDialogProps {
  open: boolean;
  item: KubeObjectInterface;
  title: string;
  onClose: () => void;
}

const sampleDeployment: KubeObjectInterface = {
  kind: 'Deployment',
  apiVersion: 'apps/v1',
  metadata: {
    name: 'nginx-deployment',
    namespace: 'default',
    uid: 'd1e2f3a4-b5c6-7890-abcd-ef0123456789',
    resourceVersion: '24680',
    creationTimestamp: '2023-01-01T08:00:00Z',
    generation: 4,
    labels: {
      app: 'nginx',
    },
    annotations: {
      'deployment.kubernetes.io/revision': '4',
    },
    managedFields: [
      {
        manager: 'kube-controller-manager',
        operation: 'Update',
        apiVersion: 'apps/v1',
        subresource: '',
        timestamp: '2023-01-03T09:30:00Z',
        fieldsType: 'FieldsV1',
        fieldsV1: {
          'f:status': {
            'f:availableReplicas': {},
            'f:conditions': {
              '.': {},
              'k:{"type":"Available"}': {
                '.': {},
                'f:lastTransitionTime': {},
                'f:lastUpdateTime': {},
                'f:message': {},
                'f:reason': {},
                'f:status': {},
                'f:type': {},
              },
            },
            'f:observedGeneration': {},
            'f:readyReplicas': {},
            'f:replicas': {},
            'f:updatedReplicas': {},
          },
        },
      },
    ],
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'nginx' },
    },
    template: {
      metadata: {
        labels: { app: 'nginx' },
      },
      spec: {
        containers: [
          {
            name: 'nginx',
            image: 'registry.k8s.io/nginx:1.25.3',
            ports: [{ containerPort: 80 }],
            resources: {
              requests: { cpu: '100m', memory: '128Mi' },
              limits: { cpu: '500m', memory: '256Mi' },
            },
          },
        ],
      },
    },
  },
  status: {
    replicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    updatedReplicas: 3,
    observedGeneration: 4,
  },
};

const sampleConfigMap: KubeObjectInterface = {
  kind: 'ConfigMap',
  apiVersion: 'v1',
  metadata: {
    name: 'app-config',
    namespace: 'default',
    uid: 'c0ffee00-0000-0000-0000-000000000001',
    resourceVersion: '13579',
    creationTimestamp: '2023-01-01T08:00:00Z',
  },
  data: {
    'app.properties': 'logLevel=info\nfeatureX=true\nmaxConnections=50',
    'feature-flags.json': '{"newDashboard": true, "betaSearch": false}',
  },
};

export default {
  title: 'Resource/DryRunPreviewDialog',
  component: DryRunPreviewDialog,
  decorators: [
    Story => (
      <Provider store={store}>
        <Story />
      </Provider>
    ),
  ],
  argTypes: {
    open: { control: 'boolean' },
    title: { control: 'text' },
  },
} as Meta;

const Template: StoryFn<DryRunPreviewDialogProps> = args => <DryRunPreviewDialog {...args} />;

export const DeploymentPreview = Template.bind({});
DeploymentPreview.args = {
  open: true,
  title: 'Dry-Run Preview: Deployment/nginx-deployment → Revision 2',
  item: sampleDeployment,
  onClose: () => {},
};
DeploymentPreview.storyName = 'Deployment preview';

export const ConfigMapPreview = Template.bind({});
ConfigMapPreview.args = {
  open: true,
  title: 'Dry-Run Preview: ConfigMap/app-config',
  item: sampleConfigMap,
  onClose: () => {},
};
ConfigMapPreview.storyName = 'ConfigMap preview';

export const Closed = Template.bind({});
Closed.args = {
  open: false,
  title: 'Dry-Run Preview: Deployment/nginx-deployment',
  item: sampleDeployment,
  onClose: () => {},
};
Closed.storyName = 'Closed (renders nothing)';
