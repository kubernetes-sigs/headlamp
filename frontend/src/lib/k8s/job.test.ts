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
});
