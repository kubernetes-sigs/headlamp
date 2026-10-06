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

  it('counts an events.k8s.io singleton once', () => {
    const event = new Event({ ...baseEvent, eventTime: '2026-10-06T10:00:00Z' } as any);
    expect(event.count).toBe(1);
  });

  it('leaves the count empty without any occurrence data', () => {
    const event = new Event({ ...baseEvent } as any);
    expect(event.count).toBeUndefined();
  });
});
