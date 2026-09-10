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
import { resolveBackendToken, waitForExternalBackend } from './backendToken';

describe('resolveBackendToken', () => {
  it('uses a configured token for an external development server', () => {
    const generateToken = vi.fn(() => 'generated-token');

    expect(resolveBackendToken(true, true, 'external-token', generateToken)).toBe('external-token');
    expect(generateToken).not.toHaveBeenCalled();
  });

  it.each([
    ['an internal server', true, false, 'configured-token'],
    ['an external server without a configured token', true, true, undefined],
    ['a packaged external-server request', false, true, 'configured-token'],
  ])(
    'generates a fresh token for %s',
    (_name, isDevelopment, useExternalServer, configuredToken) => {
      const generateToken = vi.fn(() => 'generated-token');

      expect(
        resolveBackendToken(isDevelopment, useExternalServer, configuredToken, generateToken)
      ).toBe('generated-token');
      expect(generateToken).toHaveBeenCalledOnce();
    }
  );
});

describe('waitForExternalBackend', () => {
  it('retries connection failures until the external backend is ready', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const delayFn = vi.fn(async () => {});

    await expect(
      waitForExternalBackend(4466, 'development-token', {
        attempts: 3,
        retryDelayMs: 10,
        fetchFn,
        delayFn,
      })
    ).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenLastCalledWith('http://localhost:4466/config', {
      headers: { 'X-HEADLAMP_BACKEND-TOKEN': 'development-token' },
      signal: expect.any(AbortSignal),
    });
    expect(delayFn).toHaveBeenNthCalledWith(1, 10);
    expect(delayFn).toHaveBeenNthCalledWith(2, 10);
  });

  it('fails immediately when a reachable backend rejects the token', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    })) as unknown as typeof fetch;
    const delayFn = vi.fn(async () => {});

    await expect(waitForExternalBackend(4466, 'wrong-token', { fetchFn, delayFn })).rejects.toThrow(
      'External backend readiness failed: 403 Forbidden'
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(delayFn).not.toHaveBeenCalled();
  });

  it('fails after the bounded connection retry window', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    await expect(
      waitForExternalBackend(4466, 'development-token', {
        attempts: 2,
        retryDelayMs: 0,
        fetchFn,
        delayFn: async () => {},
      })
    ).rejects.toThrow('External backend did not become reachable on port 4466');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('aborts a readiness request that does not respond', async () => {
    const fetchFn = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    ) as unknown as typeof fetch;

    await expect(
      waitForExternalBackend(4466, 'development-token', {
        attempts: 1,
        requestTimeoutMs: 5,
        fetchFn,
      })
    ).rejects.toThrow('External backend did not become reachable on port 4466');
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
