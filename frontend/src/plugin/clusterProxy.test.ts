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
import {
  getAksDesktopCommandPermissions,
  getClusterProxyArgValues,
  isTrustedClusterProxyPlugin,
} from './clusterProxy';

describe('isTrustedClusterProxyPlugin', () => {
  it('allows shipped AKS Desktop and development builds, but rejects user-installed spoofing', () => {
    expect(isTrustedClusterProxyPlugin(true, 'shipped', false)).toBe(true);
    expect(isTrustedClusterProxyPlugin(true, 'development', true)).toBe(true);
    expect(isTrustedClusterProxyPlugin(true, 'development', false)).toBe(false);
    expect(isTrustedClusterProxyPlugin(true, 'user', false)).toBe(false);
    expect(isTrustedClusterProxyPlugin(true, undefined, false)).toBe(false);
    expect(isTrustedClusterProxyPlugin(false, 'shipped', false)).toBe(false);
  });
});

describe('getAksDesktopCommandPermissions', () => {
  it('grants the legacy command secret only to trusted AKS Desktop sources', () => {
    const secrets = { 'runCmd-scriptjs-azure-aks/azure-api.js': 731 };

    expect(getAksDesktopCommandPermissions(true, 'shipped', false, secrets)).toEqual(secrets);
    expect(getAksDesktopCommandPermissions(true, 'user', false, secrets)).toEqual({});
    expect(getAksDesktopCommandPermissions(true, 'development', false, secrets)).toEqual({});
  });
});

describe('getClusterProxyArgValues', () => {
  it('injects a proxy starter with the private capability for AKS Desktop', async () => {
    const invokeProxy = vi.fn().mockResolvedValue({ success: true });
    const [args, values] = getClusterProxyArgValues(
      true,
      invokeProxy,
      '0123456789abcdef0123456789abcdef'
    );

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
      '0123456789abcdef0123456789abcdef'
    );
  });

  it('does not expose proxy startup to another plugin', () => {
    const invokeProxy = vi.fn();

    expect(
      getClusterProxyArgValues(false, invokeProxy, '0123456789abcdef0123456789abcdef')
    ).toEqual([[], []]);
    expect(invokeProxy).not.toHaveBeenCalled();
  });

  it('does not create a capability without a preload bridge or secret', () => {
    expect(getClusterProxyArgValues(true, undefined, '0123456789abcdef0123456789abcdef')).toEqual([
      [],
      [],
    ]);
    expect(getClusterProxyArgValues(true, vi.fn(), undefined)).toEqual([[], []]);
    expect(getClusterProxyArgValues(true, vi.fn(), 731 as any)).toEqual([[], []]);
  });
});
