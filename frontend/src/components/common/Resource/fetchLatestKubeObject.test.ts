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
