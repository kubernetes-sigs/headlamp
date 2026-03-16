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

import Container from '@mui/material/Container';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import Overview from './Overview';

export default {
  title: 'workload/Overview',
  component: Overview,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/api/v1/pods', () =>
            HttpResponse.json({
              kind: 'PodList',
              apiVersion: 'v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'pod-1',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T10:00:00Z',
                    uid: 'pod-uid-1',
                  },
                  spec: {},
                  status: {
                    phase: 'Running',
                    conditions: [{ type: 'Ready', status: 'True' }],
                  },
                },
                {
                  metadata: {
                    name: 'pod-2',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T11:00:00Z',
                    uid: 'pod-uid-2',
                  },
                  spec: {},
                  status: {
                    phase: 'Pending',
                    conditions: [{ type: 'Ready', status: 'False' }],
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/apps/v1/deployments', () =>
            HttpResponse.json({
              kind: 'DeploymentList',
              apiVersion: 'apps/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'nginx-deployment',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T09:00:00Z',
                    uid: 'dep-uid-1',
                  },
                  spec: {
                    replicas: 3,
                  },
                  status: {
                    readyReplicas: 2,
                    replicas: 3,
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/apps/v1/statefulsets', () =>
            HttpResponse.json({
              kind: 'StatefulSetList',
              apiVersion: 'apps/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'mysql-statefulset',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T08:00:00Z',
                    uid: 'sts-uid-1',
                  },
                  spec: {
                    replicas: 2,
                  },
                  status: {
                    readyReplicas: 2,
                    replicas: 2,
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/apps/v1/daemonsets', () =>
            HttpResponse.json({
              kind: 'DaemonSetList',
              apiVersion: 'apps/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'fluentd-daemonset',
                    namespace: 'kube-system',
                    creationTimestamp: '2025-05-20T07:00:00Z',
                    uid: 'ds-uid-1',
                  },
                  spec: {},
                  status: {
                    numberReady: 1,
                    desiredNumberScheduled: 1,
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/apps/v1/replicasets', () =>
            HttpResponse.json({
              kind: 'ReplicaSetList',
              apiVersion: 'apps/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'nginx-deployment-abc123',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T09:30:00Z',
                    uid: 'rs-uid-1',
                  },
                  spec: {
                    replicas: 3,
                  },
                  status: {
                    readyReplicas: 2,
                    replicas: 3,
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/batch/v1/jobs', () =>
            HttpResponse.json({
              kind: 'JobList',
              apiVersion: 'batch/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'backup-job',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T12:00:00Z',
                    uid: 'job-uid-1',
                  },
                  spec: {},
                  status: {
                    succeeded: 1,
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/apis/batch/v1/cronjobs', () =>
            HttpResponse.json({
              kind: 'CronJobList',
              apiVersion: 'batch/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'daily-report-cronjob',
                    namespace: 'default',
                    creationTimestamp: '2025-05-20T06:00:00Z',
                    uid: 'cj-uid-1',
                  },
                  spec: {},
                  status: {},
                },
              ],
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <Overview />
    </Container>
  );
};

export const Workloads = Template.bind({});
