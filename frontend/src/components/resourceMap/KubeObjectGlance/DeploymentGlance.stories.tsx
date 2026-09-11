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
import Deployment, { KubeDeployment } from '../../../lib/k8s/deployment';
import { DeploymentGlance } from './DeploymentGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/DeploymentGlance',
  component: DeploymentGlance,
} as Meta<typeof DeploymentGlance>;

const Template: StoryFn<typeof DeploymentGlance> = args => <DeploymentGlance {...args} />;

function createDeployment(
  availableReplicas: number,
  replicas: number,
  conditionTypes: string[]
): Deployment {
  const json: KubeDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'my-deployment',
      namespace: 'default',
      uid: 'deployment-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    spec: {
      replicas,
      selector: { matchLabels: { app: 'my-app' } },
      template: {
        spec: {
          containers: [{ name: 'app', image: 'nginx', imagePullPolicy: 'Always' }],
          nodeName: '',
        },
      },
    },
    status: {
      replicas,
      availableReplicas,
      conditions: conditionTypes.map(type => ({ type })),
    },
  };
  return new Deployment(json);
}

export const Available = Template.bind({});
Available.args = {
  deployment: createDeployment(3, 3, ['Available', 'Progressing']),
};

export const Progressing = Template.bind({});
Progressing.args = {
  deployment: createDeployment(1, 3, ['Progressing']),
};

export const Unavailable = Template.bind({});
Unavailable.args = {
  deployment: createDeployment(0, 3, ['Available']),
};
