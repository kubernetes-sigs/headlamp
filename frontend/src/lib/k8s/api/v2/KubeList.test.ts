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

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass);

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

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass);

    expect(updatedList.items).toHaveLength(1);
    expect(updatedList.items[0].metadata.resourceVersion).toBe('2');
    expect(updatedList.items[0] instanceof MockKubeObject).toBe(true);
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

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass);

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

    const updatedList = KubeList.applyUpdate(initialList, updateEvent, itemClass);

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

    KubeList.applyUpdate(initialList, updateEvent, itemClass);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in update', updateEvent);
    consoleErrorSpy.mockRestore();
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

    KubeList.applyUpdate(initialList, updateEvent, itemClass);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown update type', updateEvent);
    consoleErrorSpy.mockRestore();
  });
});
