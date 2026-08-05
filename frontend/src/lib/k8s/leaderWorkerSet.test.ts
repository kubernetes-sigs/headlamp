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
import LeaderWorkerSet from './leaderWorkerSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeLeaderWorkerSet = (spec: any, status: any) =>
  new LeaderWorkerSet({
    apiVersion: 'leaderworkerset.x-k8s.io/v1',
    kind: 'LeaderWorkerSet',
    metadata: { name: 'test-lws', namespace: 'default' },
    spec,
    status,
  } as any);

describe('LeaderWorkerSet class', () => {
  describe('getDesiredReplicas', () => {
    it('returns the requested number of groups', () => {
      expect(makeLeaderWorkerSet({ replicas: 3 }, {}).getDesiredReplicas()).toBe(3);
    });

    it('defaults to the CRD default of 1 when replicas is absent', () => {
      // The Ready column and the Workloads overview health both read the desired
      // count from here, so neither can fall back to a different default and
      // disagree about the same object.
      expect(makeLeaderWorkerSet({}, {}).getDesiredReplicas()).toBe(1);
    });

    it('keeps an explicit scale to zero', () => {
      expect(makeLeaderWorkerSet({ replicas: 0 }, {}).getDesiredReplicas()).toBe(0);
    });
  });

  describe('getReadyReplicas', () => {
    it('returns the number of ready groups', () => {
      expect(makeLeaderWorkerSet({}, { readyReplicas: 2 }).getReadyReplicas()).toBe(2);
    });

    it('treats an absent readyReplicas as none ready', () => {
      expect(makeLeaderWorkerSet({}, {}).getReadyReplicas()).toBe(0);
    });
  });

  describe('getHealth', () => {
    it('classifies a fully ready leader worker set as healthy', () => {
      expect(makeLeaderWorkerSet({ replicas: 3 }, { readyReplicas: 3 }).getHealth()).toBe(
        'healthy'
      );
    });

    it('classifies a partially ready leader worker set as degraded', () => {
      expect(makeLeaderWorkerSet({ replicas: 3 }, { readyReplicas: 1 }).getHealth()).toBe(
        'degraded'
      );
    });

    it('classifies a leader worker set with no ready replicas as failed', () => {
      expect(makeLeaderWorkerSet({ replicas: 3 }, { readyReplicas: 0 }).getHealth()).toBe('failed');
      expect(makeLeaderWorkerSet({ replicas: 3 }, {}).getHealth()).toBe('failed');
    });

    it('classifies a leader worker set still creating its groups as transitional', () => {
      expect(
        makeLeaderWorkerSet(
          { replicas: 3 },
          { readyReplicas: 0, conditions: [{ type: 'Progressing', status: 'True' }] }
        ).getHealth()
      ).toBe('transitional');
    });

    it('treats a deliberate scale to zero as healthy', () => {
      expect(makeLeaderWorkerSet({ replicas: 0 }, { readyReplicas: 0 }).getHealth()).toBe(
        'healthy'
      );
    });

    it('does not confuse an absent replicas field with a scale to zero', () => {
      // The CRD defaults replicas to 1, so an absent field is one desired group
      // rather than none, and no ready groups is not healthy.
      expect(makeLeaderWorkerSet({}, { readyReplicas: 0 }).getHealth()).toBe('failed');
      expect(makeLeaderWorkerSet({}, { readyReplicas: 1 }).getHealth()).toBe('healthy');
    });

    it('classifies an in-progress upgrade as transitional', () => {
      expect(
        makeLeaderWorkerSet(
          { replicas: 3 },
          { readyReplicas: 3, conditions: [{ type: 'UpdateInProgress', status: 'True' }] }
        ).getHealth()
      ).toBe('transitional');
    });

    it('ignores conditions that are not True', () => {
      expect(
        makeLeaderWorkerSet(
          { replicas: 2 },
          { readyReplicas: 2, conditions: [{ type: 'UpdateInProgress', status: 'False' }] }
        ).getHealth()
      ).toBe('healthy');
    });
  });
});
