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
import {
  getBackstageToken,
  getTrustedBackstageOrigins,
  isTrustedBackstageOrigin,
  setupBackstageMessageReceiver,
} from './backstageMessageReceiver';
import { encodeBase64 } from './base64';

vi.mock('./isBackstage', () => ({
  isBackstage: () => true,
}));

const TRUSTED_ORIGIN = 'https://backstage.example.com';
const UNTRUSTED_ORIGIN = 'https://evil.example.com';

function dispatchMessage(data: unknown, origin: string) {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('getTrustedBackstageOrigins / isTrustedBackstageOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('trusts no origin when REACT_APP_BACKSTAGE_ORIGIN is unset', () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', '');

    expect(getTrustedBackstageOrigins()).toEqual([]);
    expect(isTrustedBackstageOrigin(TRUSTED_ORIGIN)).toBe(false);
  });

  it('trusts a single configured origin', () => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', TRUSTED_ORIGIN);

    expect(getTrustedBackstageOrigins()).toEqual([TRUSTED_ORIGIN]);
    expect(isTrustedBackstageOrigin(TRUSTED_ORIGIN)).toBe(true);
    expect(isTrustedBackstageOrigin(UNTRUSTED_ORIGIN)).toBe(false);
  });

  it('trusts a comma-separated list of origins, trimming whitespace', () => {
    vi.stubEnv(
      'REACT_APP_BACKSTAGE_ORIGIN',
      ` ${TRUSTED_ORIGIN} , https://other-backstage.example.com `
    );

    expect(getTrustedBackstageOrigins()).toEqual([
      TRUSTED_ORIGIN,
      'https://other-backstage.example.com',
    ]);
    expect(isTrustedBackstageOrigin('https://other-backstage.example.com')).toBe(true);
  });
});

describe('setupBackstageMessageReceiver', () => {
  let cleanup: () => void;

  beforeEach(() => {
    vi.stubEnv('REACT_APP_BACKSTAGE_ORIGIN', TRUSTED_ORIGIN);
    vi.useFakeTimers();
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    cleanup = setupBackstageMessageReceiver();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('accepts a BACKSTAGE_AUTH_TOKEN message from the trusted origin', async () => {
    dispatchMessage(
      { type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 'trusted-token' } },
      TRUSTED_ORIGIN
    );
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBe('trusted-token');
  });

  it('ignores a message from an untrusted origin and does not store its token', async () => {
    dispatchMessage(
      { type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 'malicious-token' } },
      UNTRUSTED_ORIGIN
    );
    await vi.runAllTimersAsync();

    expect(getBackstageToken()).toBeNull();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it('sends the acknowledgement only to the validated trusted origin', async () => {
    dispatchMessage(
      { type: 'BACKSTAGE_AUTH_TOKEN', payload: { token: 'trusted-token' } },
      TRUSTED_ORIGIN
    );
    await vi.runAllTimersAsync();

    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'BACKSTAGE_AUTH_TOKEN_ACK' },
      TRUSTED_ORIGIN
    );
  });

  it('stores the kubeconfig and acknowledges a BACKSTAGE_KUBECONFIG message from the trusted origin', async () => {
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

    dispatchMessage(
      { type: 'BACKSTAGE_KUBECONFIG', payload: { kubeconfig: kubeconfigBase64 } },
      TRUSTED_ORIGIN
    );
    await vi.runAllTimersAsync();

    expect(findAndReplaceKubeconfig).toHaveBeenCalledWith('test-context', expect.any(String), true);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'BACKSTAGE_KUBECONFIG_ACK' },
      TRUSTED_ORIGIN
    );
  });

  it('ignores a BACKSTAGE_KUBECONFIG message from an untrusted origin', async () => {
    const findAndReplaceKubeconfig = vi
      .spyOn(statelessFunctions, 'findAndReplaceKubeconfig')
      .mockResolvedValue(undefined as any);

    dispatchMessage(
      { type: 'BACKSTAGE_KUBECONFIG', payload: { kubeconfig: 'irrelevant' } },
      UNTRUSTED_ORIGIN
    );
    await vi.runAllTimersAsync();

    expect(findAndReplaceKubeconfig).not.toHaveBeenCalled();
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});
