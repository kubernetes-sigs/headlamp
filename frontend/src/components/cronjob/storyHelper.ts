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

import { KubeCronJob } from '../../lib/k8s/cronJob';

const creationTimestamp = new Date('2022-01-01').toISOString();
// const stateDate = new Date(new Date(creationTimestamp).getTime() + 1000 * 60 * 5).toISOString();

const baseCronJob = {
  kind: 'CronJob',
  apiVersion: 'batch/v1',
  metadata: {
    name: 'baseCronJob',
    namespace: 'default',
    resourceVersion: '1234',
    uid: '123',
    generation: 1,
    creationTimestamp,
  },
  spec: {
    schedule: 'to-be-decided',
    concurrencyPolicy: 'Allow',
    suspend: false,
    jobTemplate: {
      metadata: {
        creationTimestamp: null,
      },
      spec: {
        template: {
          metadata: {
            creationTimestamp: null,
          },
          spec: {
            containers: [
              {
                name: 'hello',
                image: 'busybox:1.28',
                command: ['/bin/sh', '-c', 'date; echo Hello from the Kubernetes cluster'],
                resources: {},
                terminationMessagePath: '/dev/termination-log',
                terminationMessagePolicy: 'File',
                imagePullPolicy: 'IfNotPresent',
              },
            ],
            restartPolicy: 'OnFailure',
            terminationGracePeriodSeconds: 30,
            dnsPolicy: 'ClusterFirst',
            securityContext: {},
            schedulerName: 'default-scheduler',
          },
        },
      },
    },
    successfulJobsHistoryLimit: 3,
    failedJobsHistoryLimit: 1,
  },
  status: {},
} as KubeCronJob;

// Exporting so these can be used for details views
export const cronJobList = [
  {
    ...baseCronJob,
    metadata: { ...baseCronJob.metadata, name: 'every-minute' },
    spec: { ...baseCronJob.spec, schedule: '* * * * *' },
  },
  {
    ...baseCronJob,
    metadata: { ...baseCronJob.metadata, name: 'every-minute-one-char' },
    spec: { ...baseCronJob.spec, schedule: '*' },
  },
  {
    ...baseCronJob,
    metadata: { ...baseCronJob.metadata, name: 'every-hour' },
    spec: { ...baseCronJob.spec, schedule: '0 * * * *' },
  },
  {
    ...baseCronJob,
    metadata: { ...baseCronJob.metadata, name: 'weekday-morning' },
    spec: { ...baseCronJob.spec, schedule: '0 9 * * 1-5' },
  },
  {
    ...baseCronJob,
    metadata: { ...baseCronJob.metadata, name: 'last-day-of-month' },
    spec: { ...baseCronJob.spec, schedule: '0 0 L * *' },
  },
];
