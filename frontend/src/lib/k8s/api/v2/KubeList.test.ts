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

import { describe, expect, it, vi } from 'vitest';
import { KubeObjectClass, KubeObjectInterface } from '../../KubeObject';
import { KubeList, KubeListUpdateEvent } from './KubeList';

class MockKubeObject implements KubeObjectInterface {
  apiVersion = 'v1';
  kind = 'MockKubeObject';
  metadata: any = {
    uid: 'mock-uid',
    resourceVersion: '1',
  };

  constructor(data: Partial<KubeObjectInterface>) {
    Object.assign(this, data);
  }
}

const cluster = 'cluster-name';

describe('KubeList.applyUpdate', () => {
  const itemClass = MockKubeObject as unknown as KubeObjectClass;
  const initialList: KubeList<any> = {
    kind: 'MockKubeList',
    apiVersion: 'v1',
    items: [
      { apiVersion: 'v1', kind: 'MockKubeObject', metadata: { uid: '1', resourceVersion: '1' } },
    ],
    metadata: {
      resourceVersion: '1',
    },
  };

  it('should add a new item on ADDED event', () => {
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'ADDED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '2', resourceVersion: '2' },
      },
    };

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(updatedList.items).toHaveLength(2);
    expect(updatedList.items[1].metadata.uid).toBe('2');
    expect(updatedList.items[1] instanceof MockKubeObject).toBe(true);
  });

  it('should modify an existing item on MODIFIED event', () => {
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'MODIFIED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '1', resourceVersion: '2' },
      },
    };

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(updatedList.items).toHaveLength(1);
    expect(updatedList.items[0].metadata.resourceVersion).toBe('2');
    expect(updatedList.items[0] instanceof MockKubeObject).toBe(true);
  });

  it('should keep pagination metadata when applying watch updates', () => {
    const paginatedList: KubeList<any> = {
      ...initialList,
      metadata: {
        resourceVersion: '1',
        continue: 'continue-token',
        remainingItemCount: 10,
      },
    };
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'MODIFIED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '1', resourceVersion: '2' },
      },
    };

    const updatedList = KubeList.applyUpdate(paginatedList, updateEvent, itemClass, cluster);

    expect(updatedList.metadata).toEqual({
      resourceVersion: '2',
      continue: 'continue-token',
      remainingItemCount: 10,
    });
  });

  it('should add a new item on MODIFIED event', () => {
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'MODIFIED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '3', resourceVersion: '3' },
      },
    };

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(updatedList.items).toHaveLength(2);
    expect(updatedList.items[1].metadata.uid).toBe('3');
    expect(updatedList.items[1] instanceof MockKubeObject).toBe(true);
  });

  it('should delete an existing item on DELETED event', () => {
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'DELETED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '1', resourceVersion: '2' },
      },
    };

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(updatedList.items).toHaveLength(0);
  });

  it('should log an error on ERROR event', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'ERROR',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '1', resourceVersion: '2' },
      },
    };

    KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in update', updateEvent);
    consoleErrorSpy.mockRestore();
  });

  it('should keep the list resource version when an ERROR event carries none', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = {
      type: 'ERROR',
      object: { apiVersion: 'v1', kind: 'Status', metadata: {} },
    } as any;

    const updatedList = KubeList.applyUpdate(initialList, update, itemClass, cluster);

    expect(updatedList.metadata.resourceVersion).toBe('1');
    consoleSpy.mockRestore();
  });

  it('should still skip stale updates after an ERROR event', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const afterError = KubeList.applyUpdate(
      initialList,
      { type: 'ERROR', object: { apiVersion: 'v1', kind: 'Status', metadata: {} } } as any,
      itemClass,
      cluster
    );

    const stale = KubeList.applyUpdate(
      afterError,
      {
        type: 'DELETED',
        object: {
          apiVersion: 'v1',
          kind: 'MockKubeObject',
          metadata: { uid: '1', resourceVersion: '1' },
        },
      } as any,
      itemClass,
      cluster
    );

    expect(stale.items).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it('should advance the resource version on a BOOKMARK event', () => {
    const update = {
      type: 'BOOKMARK',
      object: { apiVersion: 'v1', kind: 'MockKubeObject', metadata: { resourceVersion: '9' } },
    } as any;

    const updatedList = KubeList.applyUpdate(initialList, update, itemClass, cluster);

    expect(updatedList.metadata.resourceVersion).toBe('9');
    expect(updatedList.items).toEqual(initialList.items);
  });

  it('should ignore a BOOKMARK event with no resource version', () => {
    const update = {
      type: 'BOOKMARK',
      object: { apiVersion: 'v1', kind: 'MockKubeObject', metadata: {} },
    } as any;

    expect(KubeList.applyUpdate(initialList, update, itemClass, cluster)).toBe(initialList);
  });

  it('should keep the list resource version when an event carries an empty one', () => {
    const update = {
      type: 'ADDED',
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '2', resourceVersion: '' },
      },
    } as any;

    const updatedList = KubeList.applyUpdate(initialList, update, itemClass, cluster);

    expect(updatedList.metadata.resourceVersion).toBe('1');
    expect(updatedList.items).toHaveLength(2);
  });

  it('should log an error on unknown event type', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const updateEvent: KubeListUpdateEvent<MockKubeObject> = {
      type: 'UNKNOWN' as any,
      object: {
        apiVersion: 'v1',
        kind: 'MockKubeObject',
        metadata: { uid: '1', resourceVersion: '2' },
      },
    };

    KubeList.applyUpdate(initialList, updateEvent, itemClass, cluster);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown update type', updateEvent);
    consoleErrorSpy.mockRestore();
  });
});
