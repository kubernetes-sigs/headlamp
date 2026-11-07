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
import DisaggregatedSet from './disaggregatedSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeDisaggregatedSet = (spec: any, status: any) =>
  new DisaggregatedSet({
    apiVersion: 'disaggregatedset.x-k8s.io/v1',
    kind: 'DisaggregatedSet',
    metadata: { name: 'test-disaggregatedset', namespace: 'default' },
    spec,
    status,
  } as any);

describe('DisaggregatedSet class', () => {
  describe('getDesiredReplicas', () => {
    it('returns the requested number of slices', () => {
      expect(makeDisaggregatedSet({ slices: 3 }, {}).getDesiredReplicas()).toBe(3);
    });

    it('returns the requested number of replicas when using replicas field', () => {
      expect(makeDisaggregatedSet({ replicas: 2 }, {}).getDesiredReplicas()).toBe(2);
    });

    it('defaults to 1 when slices or replicas is absent', () => {
      expect(makeDisaggregatedSet({}, {}).getDesiredReplicas()).toBe(1);
    });

    it('keeps an explicit scale to zero', () => {
      expect(makeDisaggregatedSet({ slices: 0 }, {}).getDesiredReplicas()).toBe(0);
    });
  });

  describe('getReadyReplicas', () => {
    it('returns the number of ready slices', () => {
      expect(makeDisaggregatedSet({}, { readySlices: 2 }).getReadyReplicas()).toBe(2);
    });

    it('returns the number of ready replicas when readyReplicas is present', () => {
      expect(makeDisaggregatedSet({}, { readyReplicas: 3 }).getReadyReplicas()).toBe(3);
    });

    it('treats absent ready fields as none ready', () => {
      expect(makeDisaggregatedSet({}, {}).getReadyReplicas()).toBe(0);
    });
  });

  describe('getHealth', () => {
    it('classifies a fully ready disaggregated set as healthy', () => {
      expect(makeDisaggregatedSet({ slices: 3 }, { readySlices: 3 }).getHealth()).toBe('healthy');
    });

    it('classifies a partially ready disaggregated set as degraded', () => {
      expect(makeDisaggregatedSet({ slices: 3 }, { readySlices: 1 }).getHealth()).toBe('degraded');
    });

    it('classifies a disaggregated set with no ready slices as failed', () => {
      expect(makeDisaggregatedSet({ slices: 3 }, { readySlices: 0 }).getHealth()).toBe('failed');
      expect(makeDisaggregatedSet({ slices: 3 }, {}).getHealth()).toBe('failed');
    });

    it('classifies a disaggregated set still creating its groups as transitional', () => {
      expect(
        makeDisaggregatedSet(
          { slices: 3 },
          { readySlices: 0, conditions: [{ type: 'Progressing', status: 'True' }] }
        ).getHealth()
      ).toBe('transitional');
    });

    it('treats a deliberate scale to zero as healthy', () => {
      expect(makeDisaggregatedSet({ slices: 0 }, { readySlices: 0 }).getHealth()).toBe('healthy');
    });

    it('classifies an in-progress upgrade as transitional', () => {
      expect(
        makeDisaggregatedSet(
          { slices: 3 },
          { readySlices: 3, conditions: [{ type: 'UpdateInProgress', status: 'True' }] }
        ).getHealth()
      ).toBe('transitional');
    });

    it('ignores conditions that are not True', () => {
      expect(
        makeDisaggregatedSet(
          { slices: 2 },
          { readySlices: 2, conditions: [{ type: 'UpdateInProgress', status: 'False' }] }
        ).getHealth()
      ).toBe('healthy');
    });
  });

  describe('getBaseObject', () => {
    it('creates a valid base object with default roles', () => {
      const baseObject = DisaggregatedSet.getBaseObject();
      expect(baseObject.kind).toBe('DisaggregatedSet');
      expect(baseObject.spec.roles?.length).toBe(2);
      expect(baseObject.spec.roles?.[0].name).toBe('prefill');
      expect(baseObject.spec.roles?.[1].name).toBe('decode');
    });
  });
});
