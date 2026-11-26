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

import { KubeObject } from '../../../lib/k8s/KubeObject';
import { fetchLatestKubeObject } from './fetchLatestKubeObject';

describe('fetchLatestKubeObject', () => {
  it('fetches the resource by name and namespace and preserves its cluster', async () => {
    const latestItem = { cluster: '' } as KubeObject;
    const cancel = vi.fn();
    const request = vi.fn(() => Promise.resolve(cancel));
    const apiGet = vi.fn((onGet: (item: KubeObject) => void) => {
      onGet(latestItem);
      return request;
    });
    const item = {
      cluster: 'cluster-a',
      getName: () => 'hardware-1',
      getNamespace: () => 'tinkerbell',
      _class: () => ({ apiGet }),
    } as unknown as KubeObject;

    await expect(fetchLatestKubeObject(item)).resolves.toBe(latestItem);

    expect(apiGet).toHaveBeenCalledWith(
      expect.any(Function),
      'hardware-1',
      'tinkerbell',
      expect.any(Function),
      { cluster: 'cluster-a' }
    );
    expect(latestItem.cluster).toBe('cluster-a');
    expect(request).toHaveBeenCalledTimes(1);
    // Allow the cancel microtask scheduled by fetchLatestKubeObject() to run.
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('partial Secret list-only RBAC', () => {
  function fixture(status = 403, listItems?: KubeObject[], listError?: unknown) {
    const latest = {
      cluster: '',
      kind: 'Secret',
      jsonData: {
        kind: 'Secret',
        metadata: { name: 'token', namespace: 'team' },
        data: { token: 'value' },
      },
      getName: () => 'token',
      getNamespace: () => 'team',
    } as KubeObject;
    const getCancel = vi.fn();
    const listCancel = vi.fn();
    const apiGet = vi.fn((_onGet, _name, _namespace, onError) => {
      onError({ status });
      return () => Promise.resolve(getCancel);
    });
    const apiList = vi.fn((onList, onError) => {
      if (listError) onError(listError);
      else onList(listItems ?? [latest]);
      return () => Promise.resolve(listCancel);
    });
    const item = {
      kind: 'Secret',
      jsonData: { dataCount: 1 },
      cluster: 'cluster-a',
      getName: () => 'token',
      getNamespace: () => 'team',
      _class: () => ({ apiGet, apiList }),
    } as unknown as KubeObject;
    return { item, latest, apiGet, apiList, getCancel, listCancel };
  }

  it('uses a scoped full list when individual Secret GET is forbidden', async () => {
    const f = fixture();
    await expect(fetchLatestKubeObject(f.item)).resolves.toBe(f.latest);
    expect(f.apiList).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      namespace: 'team',
      cluster: 'cluster-a',
      queryParams: { fieldSelector: 'metadata.name=token' },
    });
    expect(f.latest.cluster).toBe('cluster-a');
    expect(f.latest.jsonData.apiVersion).toBe('v1');
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(f.getCancel).toHaveBeenCalledOnce();
    expect(f.listCancel).toHaveBeenCalledOnce();
  });

  it('preserves an explicit API version from the scoped list', async () => {
    const f = fixture();
    f.latest.jsonData.apiVersion = 'existing-version';
    await expect(fetchLatestKubeObject(f.item)).resolves.toBe(f.latest);
    expect(f.latest.jsonData.apiVersion).toBe('existing-version');
    expect(f.latest.jsonData.data).toEqual({ token: 'value' });
  });

  it.each([401, 404, 500])('does not fall back on status %s', async status => {
    const f = fixture(status);
    await expect(fetchLatestKubeObject(f.item)).rejects.toEqual({ status });
    expect(f.apiList).not.toHaveBeenCalled();
  });

  it('does not fall back for a non-partial resource', async () => {
    const f = fixture();
    f.item.jsonData = {} as any;
    await expect(fetchLatestKubeObject(f.item)).rejects.toEqual({ status: 403 });
    expect(f.apiList).not.toHaveBeenCalled();
  });

  it('rejects when the scoped list is empty', async () => {
    const f = fixture(403, []);
    await expect(fetchLatestKubeObject(f.item)).rejects.toThrow();
  });

  it('rejects an unexpected name or namespace returned by the list', async () => {
    const other = {
      getName: () => 'another-secret',
      getNamespace: () => 'other-team',
    } as KubeObject;
    const f = fixture(403, [other]);
    await expect(fetchLatestKubeObject(f.item)).rejects.toThrow();
  });

  it('rejects when the scoped list is also forbidden', async () => {
    const f = fixture(403, undefined, { status: 403 });
    await expect(fetchLatestKubeObject(f.item)).rejects.toEqual({ status: 403 });
  });
});
