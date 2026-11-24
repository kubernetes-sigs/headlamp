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
import { getTestDate } from '../../helpers/testHelpers';
import CronJob from '../../lib/k8s/cronJob';
import Deployment from '../../lib/k8s/deployment';
import StatefulSet from '../../lib/k8s/statefulSet';
import type { Workload } from '../../lib/k8s/Workload';
import { WorkloadCircleChart, WorkloadCircleChartProps } from './Charts';

const createMockDeployment = (name: string, readyReplicas: number, replicas: number) => {
  return new Deployment(
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: name,
        namespace: 'default',
        creationTimestamp: getTestDate().toISOString(),
        uid: `${name}-uid`,
      },
      spec: {
        replicas: replicas,
        selector: {
          matchLabels: {
            app: name,
          },
        },
        template: {
          metadata: {
            name: `${name}-pod`,
            labels: {
              app: name,
            },
            creationTimestamp: getTestDate().toISOString(),
            uid: `${name}-pod-uid`,
            namespace: 'default',
          },
          spec: {
            containers: [
              {
                name: name,
                image: `${name}:latest`,
                imagePullPolicy: 'IfNotPresent',
                ports: [{ containerPort: 80 }],
              },
            ],
            nodeName: 'node-1',
          },
        },
      },
      status: {
        readyReplicas: readyReplicas,
        replicas: replicas,
        availableReplicas: readyReplicas,
        updatedReplicas: readyReplicas,
      },
    },
    'deployment'
  );
};

const createMockStatefulSet = (name: string, readyReplicas: number, replicas: number) => {
  return new StatefulSet(
    {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: name,
        namespace: 'default',
        creationTimestamp: getTestDate().toISOString(),
        uid: `${name}-uid`,
      },
      spec: {
        replicas: replicas,
        selector: {
          matchLabels: {
            app: name,
          },
        },
        updateStrategy: {
          rollingUpdate: { partition: 1 },
          type: 'RollingUpdate',
        },
        template: {
          metadata: {
            name: `${name}-pod`,
            labels: {
              app: name,
            },
            creationTimestamp: getTestDate().toISOString(),
            uid: `${name}-pod-uid`,
            namespace: 'default',
          },
          spec: {
            containers: [
              {
                name: name,
                image: `${name}:latest`,
                imagePullPolicy: 'IfNotPresent',
                ports: [{ containerPort: 80 }],
              },
            ],
            nodeName: 'node-1',
          },
        },
      },
      status: {
        readyReplicas: readyReplicas,
        replicas: replicas,
        currentReplicas: readyReplicas,
        updatedReplicas: readyReplicas,
      },
    },
    'statefulset'
  );
};

const createMockCronJob = (name: string, suspend: boolean) => {
  return new CronJob({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      name: name,
      namespace: 'default',
      creationTimestamp: getTestDate().toISOString(),
      uid: `${name}-uid`,
    },
    spec: {
      schedule: '*/5 * * * *',
      suspend: suspend,
      concurrencyPolicy: 'Allow',
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [{ name: name, image: 'busybox', imagePullPolicy: 'IfNotPresent' }],
            },
          },
        },
      },
    },
    status: {},
  });
};

const categorizeCronJob = (item: Workload) => (item as CronJob).getHealth();

const allRunningDeployment = createMockDeployment('running-deploy', 3, 3);
const allFailedDeployment = createMockDeployment('failed-deploy', 0, 3);
const partialRunningDeployment = createMockDeployment('partial-deploy', 2, 3);

const allRunningStatefulSet = createMockStatefulSet('running-ss', 3, 3);
const allFailedStatefulSet = createMockStatefulSet('failed-ss', 0, 3);
const partialRunningStatefulSet = createMockStatefulSet('partial-ss', 1, 3);

export default {
  title: 'workload/Charts',
  component: WorkloadCircleChart,
  argTypes: {
    workloadData: {
      control: {
        type: 'object',
      },
    },
    partialLabel: {
      control: {
        type: 'text',
      },
    },
    totalLabel: {
      control: {
        type: 'text',
      },
    },
  },
} as Meta<WorkloadCircleChartProps>;

const Template: StoryFn<WorkloadCircleChartProps> = (args: WorkloadCircleChartProps) => (
  <WorkloadCircleChart {...args} />
);

export const DefaultDeployment = Template.bind({});
DefaultDeployment.args = {
  workloadData: [partialRunningDeployment],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const LoadingWorkload = Template.bind({});
LoadingWorkload.args = {
  title: 'Deployments',
  workloadData: null,
  partialLabel: 'Loading',
  totalLabel: 'Total',
};

export const AllRunningDeployment = Template.bind({});
AllRunningDeployment.args = {
  workloadData: [allRunningDeployment],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const AllFailedDeployment = Template.bind({});
AllFailedDeployment.args = {
  workloadData: [allFailedDeployment],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const DefaultStatefulSet = Template.bind({});
DefaultStatefulSet.args = {
  workloadData: [partialRunningStatefulSet],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const AllRunningStatefulSet = Template.bind({});
AllRunningStatefulSet.args = {
  workloadData: [allRunningStatefulSet],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const AllFailedStatefulSet = Template.bind({});
AllFailedStatefulSet.args = {
  workloadData: [allFailedStatefulSet],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const MixedWorkloads = Template.bind({});
MixedWorkloads.args = {
  workloadData: [allRunningDeployment, partialRunningStatefulSet, allFailedDeployment],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const Empty = Template.bind({});
Empty.args = {
  workloadData: [],
  partialLabel: 'Failed',
  totalLabel: 'Running',
};

export const SuspendedCronJobs = Template.bind({});
SuspendedCronJobs.args = {
  title: 'Cron Jobs',
  workloadData: [createMockCronJob('paused-1', true), createMockCronJob('paused-2', true)],
  partialLabel: 'Failed',
  totalLabel: 'Healthy',
  categorize: categorizeCronJob,
};

export const HealthyAndSuspendedCronJobs = Template.bind({});
HealthyAndSuspendedCronJobs.args = {
  title: 'Cron Jobs',
  workloadData: [createMockCronJob('running', false), createMockCronJob('paused', true)],
  partialLabel: 'Failed',
  totalLabel: 'Healthy',
  categorize: categorizeCronJob,
};
