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
  describe('getHealth', () => {
    const makeJob = (status: any) =>
      new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'test-job', namespace: 'default' },
        spec: {},
        status,
      } as any);

    it('classifies a Complete job as healthy', () => {
      expect(makeJob({ conditions: [{ type: 'Complete', status: 'True' }] }).getHealth()).toBe(
        'healthy'
      );
    });

    it('classifies a Failed job as failed', () => {
      expect(makeJob({ conditions: [{ type: 'Failed', status: 'True' }] }).getHealth()).toBe(
        'failed'
      );
    });

    it('classifies a Suspended job as degraded', () => {
      expect(makeJob({ conditions: [{ type: 'Suspended', status: 'True' }] }).getHealth()).toBe(
        'degraded'
      );
    });

    it('classifies a running job with no terminal condition as transitional', () => {
      expect(makeJob({ active: 1 }).getHealth()).toBe('transitional');
      expect(makeJob({}).getHealth()).toBe('transitional');
    });

    it('ignores conditions whose status is not True', () => {
      expect(makeJob({ conditions: [{ type: 'Failed', status: 'False' }] }).getHealth()).toBe(
        'transitional'
      );
    });

    it('prioritizes Failed over Complete', () => {
      expect(
        makeJob({
          conditions: [
            { type: 'Complete', status: 'True' },
            { type: 'Failed', status: 'True' },
          ],
        }).getHealth()
      ).toBe('failed');
    });
  });

  const mockJobData = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'test-job',
      namespace: 'default',
      uid: 'job-uid-123',
    },
    spec: {
      template: {
        spec: {
          containers: [
            { name: 'worker', image: 'busybox:latest', imagePullPolicy: 'Always' },
            { name: 'sidecar', image: 'sidecar:v1', imagePullPolicy: 'IfNotPresent' },
          ],
        },
      },
    },
    status: {
      startTime: '2024-01-01T00:00:00Z',
      completionTime: '2024-01-01T00:01:00Z',
    },
  };

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const job = new Job(JSON.parse(JSON.stringify(mockJobData)));
      const containers = job.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('worker');
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
    it('returns duration in milliseconds when both times are present', () => {
      const job = new Job(JSON.parse(JSON.stringify(mockJobData)));
      expect(job.getDuration()).toBe(60000);
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

    it('returns -1 when both times are missing', () => {
      const data = JSON.parse(JSON.stringify(mockJobData));
      delete data.status;
      const job = new Job(data);
      expect(job.getDuration()).toBe(-1);
    });
  });

  describe('getBaseObject', () => {
    it('returns a Job with correct defaults', () => {
      const base = Job.getBaseObject();
      expect(base.kind).toBe('Job');
      expect(base.apiVersion).toBe('batch/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.metadata.labels).toEqual({ app: 'headlamp' });
      expect(base.spec.selector?.matchLabels).toEqual({ app: 'headlamp' });
      expect(base.spec.template.spec.restartPolicy).toBe('Never');
    });

    it('includes a default container template', () => {
      const base = Job.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers[0].name).toBe('');
      expect(base.spec.template.spec.containers[0].image).toBe('');
      expect(base.spec.template.spec.containers[0].imagePullPolicy).toBe('Always');
    });
  });
});
