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
import { getClusterProxyArgValues } from './clusterProxy';

describe('getClusterProxyArgValues', () => {
  it('injects a proxy starter with the private capability for Azure AKS', async () => {
    const invokeProxy = vi.fn().mockResolvedValue({ success: true });
    const [args, values] = getClusterProxyArgValues(true, invokeProxy, {
      startClusterProxy: 731,
    });

    expect(args).toEqual(['startClusterProxy']);
    await expect(
      (values[0] as Function)({
        cluster: 'cluster-a',
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        resourceGroup: 'valid-rg',
      })
    ).resolves.toEqual({ success: true });
    expect(invokeProxy).toHaveBeenCalledWith(
      {
        cluster: 'cluster-a',
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        resourceGroup: 'valid-rg',
      },
      731
    );
  });

  it('does not expose proxy startup to another plugin', () => {
    const invokeProxy = vi.fn();

    expect(getClusterProxyArgValues(false, invokeProxy, { startClusterProxy: 731 })).toEqual([
      [],
      [],
    ]);
    expect(invokeProxy).not.toHaveBeenCalled();
  });

  it('does not create a capability without a preload bridge or secret', () => {
    expect(getClusterProxyArgValues(true, undefined, { startClusterProxy: 731 })).toEqual([[], []]);
    expect(getClusterProxyArgValues(true, vi.fn(), {})).toEqual([[], []]);
  });
});
