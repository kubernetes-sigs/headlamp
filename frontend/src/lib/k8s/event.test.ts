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
import Event from './event';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeEvent(involvedObject: any) {
  return new Event({
    involvedObject,
    metadata: {
      name: 'test-event',
      namespace: 'default',
      uid: 'event-uid',
      creationTimestamp: '2020-01-01T00:00:00Z',
    },
  } as any);
}

describe('Event involvedObjectInstance', () => {
  it('resolves a built-in class when kind and apiVersion group match', () => {
    const event = makeEvent({
      kind: 'PriorityClass',
      apiVersion: 'scheduling.k8s.io/v1',
      name: 'high-priority',
    });

    expect(event.involvedObjectInstance).not.toBeNull();
    expect(event.involvedObjectInstance?.kind).toBe('PriorityClass');
  });

  it('returns null when the involvedObject kind matches a built-in but the group differs', () => {
    // Reproduces issue #7321: a CRD sharing a kind name with a built-in resource
    // (e.g. Kueue's kueue.x-k8s.io/v1beta1 Workload vs. scheduling.k8s.io's
    // PriorityClass-style registration) must not resolve to the wrong class.
    const event = makeEvent({
      kind: 'PriorityClass',
      apiVersion: 'kueue.x-k8s.io/v1beta1',
      name: 'not-a-priority-class',
    });

    expect(event.involvedObjectInstance).toBeNull();
  });

  it('returns null when there is no involvedObject', () => {
    const event = makeEvent(undefined);
    expect(event.involvedObjectInstance).toBeNull();
  });
});

const baseEvent = {
  apiVersion: 'v1',
  kind: 'Event',
  metadata: {
    name: 'test-event',
    namespace: 'default',
    uid: 'uid-1',
    creationTimestamp: '2026-10-06T10:00:00Z',
  },
  involvedObject: { kind: 'Deployment', name: 'dep', namespace: 'default' },
  reason: 'Testing',
  message: 'test',
  type: 'Warning',
};

describe('Event count', () => {
  it('prefers the series count when present', () => {
    const event = new Event({
      ...baseEvent,
      count: 5,
      series: { count: 9, lastObservedTime: '2026-10-06T10:05:00Z' },
    } as any);
    expect(event.count).toBe(9);
  });

  it('uses the legacy count without a series', () => {
    const event = new Event({ ...baseEvent, count: 5 } as any);
    expect(event.count).toBe(5);
  });

  it('falls back past a series that lacks a count', () => {
    const event = new Event({
      ...baseEvent,
      count: 5,
      series: { lastObservedTime: '2026-10-06T10:05:00Z' },
    } as any);
    expect(event.count).toBe(5);
  });

  it('counts a singleton once when its series lacks a count', () => {
    const event = new Event({
      ...baseEvent,
      eventTime: '2026-10-06T10:00:00Z',
      series: { lastObservedTime: '2026-10-06T10:05:00Z' },
    } as any);
    expect(event.count).toBe(1);
  });

  it('keeps an explicit zero count', () => {
    const event = new Event({
      ...baseEvent,
      count: 0,
      eventTime: '2026-10-06T10:00:00Z',
    } as any);
    expect(event.count).toBe(0);
  });

  it('counts an events.k8s.io singleton once', () => {
    const event = new Event({ ...baseEvent, eventTime: '2026-10-06T10:00:00Z' } as any);
    expect(event.count).toBe(1);
  });

  it('leaves the count empty without any occurrence data', () => {
    const event = new Event({ ...baseEvent } as any);
    expect(event.count).toBeUndefined();
  });
});
