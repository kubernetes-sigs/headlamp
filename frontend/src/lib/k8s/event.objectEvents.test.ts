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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './api/v1/clusterRequests';
import Event from './event';
import type { KubeObject } from './KubeObject';

vi.mock('.', () => ({ ResourceClasses: {} }));
vi.mock('./KubeObject', () => ({ KubeObject: class {} }));
vi.mock('./api/v1/clusterRequests', () => ({ request: vi.fn() }));

function object(uid?: string, namespace: string | undefined = 'default'): KubeObject {
  return {
    metadata: { name: 'same-name', namespace, uid },
    kind: namespace ? 'Pod' : 'Node',
    cluster: 'test-cluster',
  } as KubeObject;
}

describe('Event.objectEvents resource identity', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
    vi.mocked(request).mockResolvedValue({ items: [] });
  });

  it('selects a namespaced resource by UID as well as name and kind', async () => {
    await Event.objectEvents(object('current-uid'));
    expect(request).toHaveBeenCalledWith(
      '/api/v1/namespaces/default/events',
      { cluster: 'test-cluster' },
      true,
      true,
      expect.objectContaining({
        fieldSelector: expect.stringContaining('involvedObject.uid=current-uid'),
      })
    );
  });

  it('does not return events for an earlier resource with the same name', async () => {
    const oldEvent = { involvedObject: { uid: 'old-uid' } };
    const currentEvent = { involvedObject: { uid: 'current-uid' } };
    vi.mocked(request).mockImplementation(async (_path, _params, _logout, _cluster, query) => ({
      items: query?.fieldSelector?.includes('involvedObject.uid=current-uid')
        ? [currentEvent]
        : [oldEvent, currentEvent],
    }));
    await expect(Event.objectEvents(object('current-uid'))).resolves.toEqual([currentEvent]);
  });

  it('also scopes cluster-level resource events by UID', async () => {
    await Event.objectEvents(object('node-uid', ''));
    expect(request).toHaveBeenCalledWith(
      '/api/v1/events',
      { cluster: 'test-cluster' },
      true,
      true,
      expect.objectContaining({
        fieldSelector: expect.stringContaining('involvedObject.uid=node-uid'),
      })
    );
  });

  it('keeps name-based lookup for incomplete references without a UID', async () => {
    await Event.objectEvents(object());
    expect(request).toHaveBeenCalledWith(
      '/api/v1/namespaces/default/events',
      { cluster: 'test-cluster' },
      true,
      true,
      {
        fieldSelector:
          'involvedObject.kind=Pod,involvedObject.name=same-name,involvedObject.namespace=default',
        limit: Event.maxLimit,
      }
    );
  });
});
