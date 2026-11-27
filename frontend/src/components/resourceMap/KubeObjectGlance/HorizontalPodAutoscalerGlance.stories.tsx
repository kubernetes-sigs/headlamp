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
import HPA, { KubeHPA } from '../../../lib/k8s/hpa';
import { HorizontalPodAutoscalerGlance } from './HorizontalPodAutoscalerGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/HorizontalPodAutoscalerGlance',
  component: HorizontalPodAutoscalerGlance,
} as Meta<typeof HorizontalPodAutoscalerGlance>;

const Template: StoryFn<typeof HorizontalPodAutoscalerGlance> = args => (
  <HorizontalPodAutoscalerGlance {...args} />
);

function createHPA(
  minReplicas: number,
  maxReplicas: number,
  currentReplicas: number,
  desiredReplicas: number,
  conditionTypes: string[] = []
): HPA {
  const json: KubeHPA = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: 'my-hpa',
      namespace: 'default',
      uid: 'hpa-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    spec: {
      minReplicas,
      maxReplicas,
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'my-deployment' },
      metrics: [],
    },
    status: {
      currentReplicas,
      desiredReplicas,
      lastScaleTime: new Date().toISOString(),
      currentMetrics: null,
      conditions: conditionTypes.map(type => ({
        type,
        status: 'True',
        lastTransitionTime: new Date().toISOString(),
        reason: '',
        message: '',
      })),
    },
  };
  return new HPA(json);
}

export const Stable = Template.bind({});
Stable.args = {
  hpa: createHPA(2, 10, 3, 3, ['AbleToScale', 'ScalingActive']),
};

export const ScalingUp = Template.bind({});
ScalingUp.args = {
  hpa: createHPA(2, 10, 3, 6, ['AbleToScale', 'ScalingActive']),
};

export const AtMaxReplicas = Template.bind({});
AtMaxReplicas.args = {
  hpa: createHPA(2, 5, 5, 5, ['AbleToScale', 'ScalingLimited']),
};

export const NoConditions = Template.bind({});
NoConditions.args = {
  hpa: createHPA(1, 3, 1, 1, []),
};
