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
import JobSet from './jobSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('JobSet class', () => {
  describe('getHealth', () => {
    const makeJobSet = (status: any) =>
      new JobSet({
        apiVersion: 'jobset.x-k8s.io/v1alpha2',
        kind: 'JobSet',
        metadata: { name: 'test-jobset', namespace: 'default' },
        spec: {},
        status,
      } as any);

    it('classifies a Completed job set as healthy', () => {
      expect(makeJobSet({ conditions: [{ type: 'Completed', status: 'True' }] }).getHealth()).toBe(
        'healthy'
      );
    });

    it('classifies a Failed job set as failed', () => {
      expect(makeJobSet({ conditions: [{ type: 'Failed', status: 'True' }] }).getHealth()).toBe(
        'failed'
      );
    });

    it('classifies a Suspended job set as degraded', () => {
      expect(makeJobSet({ conditions: [{ type: 'Suspended', status: 'True' }] }).getHealth()).toBe(
        'degraded'
      );
    });

    it('classifies a job set with no terminal condition as transitional', () => {
      expect(makeJobSet({}).getHealth()).toBe('transitional');
      expect(
        makeJobSet({ conditions: [{ type: 'StartupPolicyCompleted', status: 'True' }] }).getHealth()
      ).toBe('transitional');
    });

    it('prioritizes Failed over Completed', () => {
      expect(
        makeJobSet({
          conditions: [
            { type: 'Completed', status: 'True' },
            { type: 'Failed', status: 'True' },
          ],
        }).getHealth()
      ).toBe('failed');
    });
  });
});
