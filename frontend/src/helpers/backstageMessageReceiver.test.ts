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

import jsyaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as statelessFunctions from '../stateless';
import { getBackstageToken, setupBackstageMessageReceiver } from './backstageMessageReceiver';
import { encodeBase64 } from './base64';

vi.mock('./isBackstage', () => ({
  isBackstage: () => true,
}));

function dispatchMessage(data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: 'https://backstage.example.com' })
  );
}

describe('setupBackstageMessageReceiver', () => {
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    cleanup = setupBackstageMessageReceiver();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('accepts a valid BACKSTAGE_AUTH_TOKEN message', async () => {
    dispatchMessage({ type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 'trusted-token' } });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBe('trusted-token');
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'BACKSTAGE_AUTH_TOKEN_ACK' },
      '*'
    );
  });

  it('accepts a valid BACKSTAGE_KUBECONFIG message', async () => {
    const findAndReplaceKubeconfig = vi
      .spyOn(statelessFunctions, 'findAndReplaceKubeconfig')
      .mockResolvedValue(undefined as any);

    const kubeconfig = {
      apiVersion: 'v1',
      kind: 'Config',
      'current-context': 'test-context',
      contexts: [{ name: 'test-context', context: { cluster: 'test-cluster', user: 'test-user' } }],
      clusters: [{ name: 'test-cluster', cluster: {} }],
      users: [{ name: 'test-user', user: {} }],
    };
    const kubeconfigBase64 = encodeBase64(jsyaml.dump(kubeconfig));

    dispatchMessage({ type: 'BACKSTAGE_KUBECONFIG', payload: { kubeconfig: kubeconfigBase64 } });
    await vi.runAllTimersAsync();

    expect(findAndReplaceKubeconfig).toHaveBeenCalledWith('test-context', expect.any(String), true);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'BACKSTAGE_KUBECONFIG_ACK' },
      '*'
    );
  });

  it('ignores a null event.data', async () => {
    dispatchMessage(null);
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a primitive event.data', async () => {
    dispatchMessage('not-an-object');
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a message with a null payload', async () => {
    dispatchMessage({ type: 'BACKSTAGE_AUTH_TOKEN', payload: null });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a message with a primitive payload', async () => {
    dispatchMessage({ type: 'BACKSTAGE_AUTH_TOKEN', payload: 'trusted-token' });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a message with an unknown type', async () => {
    dispatchMessage({ type: 'BACKSTAGE_UNKNOWN_TYPE', payload: { token: 'trusted-token' } });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a BACKSTAGE_AUTH_TOKEN message with no token', async () => {
    dispatchMessage({ type: 'BACKSTAGE_AUTH_TOKEN', payload: {} });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a BACKSTAGE_AUTH_TOKEN message with a non-string token', async () => {
    dispatchMessage({ type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 12345 } });
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('ignores a BACKSTAGE_KUBECONFIG message with a non-string kubeconfig', async () => {
    const findAndReplaceKubeconfig = vi
      .spyOn(statelessFunctions, 'findAndReplaceKubeconfig')
      .mockResolvedValue(undefined as any);

    dispatchMessage({ type: 'BACKSTAGE_KUBECONFIG', payload: { kubeconfig: 12345 } });
    await vi.runAllTimersAsync();

    expect(findAndReplaceKubeconfig).not.toHaveBeenCalled();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});
