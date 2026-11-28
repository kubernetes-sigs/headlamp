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
import type { KubePriorityLevelConfiguration } from './priorityLevelConfiguration';
import PriorityLevelConfiguration from './priorityLevelConfiguration';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeLevel = (spec: KubePriorityLevelConfiguration['spec'], name = 'workload-low') =>
  new PriorityLevelConfiguration({
    kind: 'PriorityLevelConfiguration',
    apiVersion: 'flowcontrol.apiserver.k8s.io/v1',
    metadata: { name, uid: `plc-${name}`, creationTimestamp: '2026-10-21T20:50:16Z' },
    spec,
  } as KubePriorityLevelConfiguration);

/** The shapes the apiserver ships: a queued Limited level and the Exempt one. */
const queued = () =>
  makeLevel({
    type: 'Limited',
    limited: {
      nominalConcurrencyShares: 100,
      lendablePercent: 90,
      limitResponse: { type: 'Queue', queuing: { queues: 128, handSize: 6, queueLengthLimit: 50 } },
    },
  });

const exempt = () =>
  makeLevel(
    { type: 'Exempt', exempt: { nominalConcurrencyShares: 0, lendablePercent: 0 } },
    'exempt'
  );

describe('PriorityLevelConfiguration', () => {
  it('is a cluster scoped flowcontrol.apiserver.k8s.io resource', () => {
    expect(PriorityLevelConfiguration.apiVersion).toBe('flowcontrol.apiserver.k8s.io/v1');
    expect(PriorityLevelConfiguration.apiName).toBe('prioritylevelconfigurations');
    expect(PriorityLevelConfiguration.isNamespaced).toBe(false);
  });

  describe('a limited level', () => {
    it('reads its shares, lending and queue parameters', () => {
      const level = queued();

      expect(level.type).toBe('Limited');
      expect(level.isExempt).toBe(false);
      expect(level.nominalConcurrencyShares).toBe(100);
      expect(level.lendablePercent).toBe(90);
      expect(level.limitResponseType).toBe('Queue');
      expect(level.queuing).toEqual({ queues: 128, handSize: 6, queueLengthLimit: 50 });
    });

    it('has no queue parameters when it rejects instead of queuing', () => {
      const level = makeLevel({
        type: 'Limited',
        limited: { nominalConcurrencyShares: 5, limitResponse: { type: 'Reject' } },
      });

      expect(level.limitResponseType).toBe('Reject');
      expect(level.queuing).toBeUndefined();
    });
  });

  describe('an exempt level', () => {
    it('reads its settings from the exempt body, not the limited one', () => {
      const level = exempt();

      expect(level.isExempt).toBe(true);
      expect(level.nominalConcurrencyShares).toBe(0);
      expect(level.lendablePercent).toBe(0);
    });

    it('has no limit response, since it is never queued or rejected', () => {
      expect(exempt().limitResponseType).toBeUndefined();
      expect(exempt().queuing).toBeUndefined();
    });
  });
});
