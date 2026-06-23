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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import Job from './job';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Job class', () => {
  const mockJobData = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'test-job',
      namespace: 'default',
      uid: 'job-uid-123',
      resourceVersion: '456',
      generation: 1,
    },
    spec: {
      backoffLimit: 6,
      completionMode: 'NonIndexed',
      completions: 1,
      parallelism: 1,
      selector: {
        matchLabels: { 'controller-uid': 'abc123' },
      },
      suspend: false,
      template: {
        spec: {
          containers: [
            { name: 'main', image: 'busybox:1.28', imagePullPolicy: 'IfNotPresent' },
            { name: 'sidecar', image: 'sidecar:v1', imagePullPolicy: 'Always' },
          ],
          restartPolicy: 'Never',
          nodeName: 'node-1',
        },
      },
    },
    status: {
      startTime: '2023-07-28T00:00:00Z',
      completionTime: '2023-07-28T08:01:00Z',
      succeeded: 1,
    },
  };

  describe('getBaseObject', () => {
    it('returns a Job with correct defaults', () => {
      const base = Job.getBaseObject();
      expect(base.kind).toBe('Job');
      expect(base.apiVersion).toBe('batch/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.metadata.labels).toEqual({ app: 'headlamp' });
      expect(base.spec.selector!.matchLabels).toEqual({ app: 'headlamp' });
      expect(base.spec.template.spec.restartPolicy).toBe('Never');
    });

    it('includes a default container template', () => {
      const base = Job.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers[0].name).toBe('');
      expect(base.spec.template.spec.containers[0].image).toBe('');
      expect(base.spec.template.spec.containers[0].imagePullPolicy).toBe('Always');
      expect(base.spec.template.spec.containers[0].command).toEqual([]);
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const job = new Job(JSON.parse(JSON.stringify(mockJobData)));
      const containers = job.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('main');
      expect(containers[1].name).toBe('sidecar');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.spec;
      const job = new Job(data);
      expect(job.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.spec.template;
      const job = new Job(data);
      expect(job.getContainers()).toEqual([]);
    });
  });

  describe('getDuration', () => {
    it('returns duration in milliseconds when both start and completion times are present', () => {
      const job = new Job(JSON.parse(JSON.stringify(mockJobData)));
      const duration = job.getDuration();
      const expected =
        new Date('2023-07-28T08:01:00Z').getTime() - new Date('2023-07-28T00:00:00Z').getTime();
      expect(duration).toBe(expected);
    });

    it('returns -1 when startTime is missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.status.startTime;
      const job = new Job(data);
      expect(job.getDuration()).toBe(-1);
    });

    it('returns -1 when completionTime is missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.status.completionTime;
      const job = new Job(data);
      expect(job.getDuration()).toBe(-1);
    });

    it('returns -1 when both start and completion times are missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.status.startTime;
      delete data.status.completionTime;
      const job = new Job(data);
      expect(job.getDuration()).toBe(-1);
    });
  });
});
