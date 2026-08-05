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
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import Deployment from '../../lib/k8s/deployment';
import Event from '../../lib/k8s/event';
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { PodDiagnosticsSection, WorkloadDiagnosticsSection } from './Diagnostics';
import {
  degradedDeployment,
  failingPod,
  healthyDeployment,
  healthyPod,
  warningEvents,
} from './storyHelper';

export default {
  title: 'Diagnostics',
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

// Pod diagnostics. Events are passed in explicitly so the component does not
// fetch them, keeping the stories self-contained.
const PodTemplate: StoryFn<{ pod: Pod; events: Event[] }> = args => (
  <PodDiagnosticsSection {...args} />
);

export const PodHealthy = PodTemplate.bind({});
PodHealthy.args = {
  pod: new Pod(healthyPod, 'minikube'),
  events: [],
};

export const PodWithIssues = PodTemplate.bind({});
PodWithIssues.args = {
  pod: new Pod(failingPod, 'minikube'),
  events: warningEvents.map(event => new Event(event, 'minikube')),
};

// Workload diagnostics. Owned pods and errors are passed directly as props.
const WorkloadTemplate: StoryFn<{
  workload: Deployment;
  pods?: Pod[] | null;
  errors?: ApiError[] | null;
}> = args => <WorkloadDiagnosticsSection {...args} />;

export const WorkloadLoading = WorkloadTemplate.bind({});
WorkloadLoading.args = {
  workload: new Deployment(healthyDeployment, 'minikube'),
  pods: null,
};

export const WorkloadHealthy = WorkloadTemplate.bind({});
WorkloadHealthy.args = {
  workload: new Deployment(healthyDeployment, 'minikube'),
  pods: [new Pod(healthyPod, 'minikube')],
};

export const WorkloadWithIssues = WorkloadTemplate.bind({});
WorkloadWithIssues.args = {
  workload: new Deployment(degradedDeployment, 'minikube'),
  pods: [new Pod(failingPod, 'minikube')],
};

export const WorkloadPodsError = WorkloadTemplate.bind({});
WorkloadPodsError.args = {
  workload: new Deployment(healthyDeployment, 'minikube'),
  pods: null,
  errors: [new ApiError('pods is forbidden: User cannot list resource "pods"', { status: 403 })],
};
