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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../v2/ApiError';
import { clusterRequest } from './clusterRequests';

vi.mock('../../../../helpers/addBackstageAuthHeaders', () => ({
  addBackstageAuthHeaders: vi.fn((headers: Record<string, string>) => headers),
}));

vi.mock('../../../../helpers/getHeadlampAPIHeaders', () => ({
  getHeadlampAPIHeaders: vi.fn(() => ({})),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(async () => null),
}));

function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

describe('clusterRequest failure handling', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it('reports an aborted request as a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abortError()))
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.status).toBe(408);
    expect(err.message).toMatch(/timed-out/i);
  });

  it('reports an abort as a timeout even when it is not an Error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject({ name: 'AbortError', message: 'The operation was aborted.' }))
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.status).toBe(408);
    expect(err.message).toMatch(/timed-out/i);
  });

  it('does not report a cancellation through the caller signal as a timeout', async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        caller.abort();
        return Promise.reject(abortError());
      })
    );

    const err: ApiError = await clusterRequest('/version', { signal: caller.signal }).catch(e => e);

    expect(err.name).toBe('AbortError');
    expect(err.status).toBeUndefined();
  });

  it('preserves a custom caller abort reason when fetch rejects', async () => {
    const caller = new AbortController();
    const reason = new TypeError('application cancellation');
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        caller.abort(reason);
        return Promise.reject(init.signal?.reason);
      })
    );

    await expect(clusterRequest('/version', { signal: caller.signal })).rejects.toBe(reason);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('applies the timeout even when the caller supplies a signal', async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(abortError()));
          })
      )
    );

    const err: ApiError = await clusterRequest('/version', {
      signal: caller.signal,
      timeout: 5,
    }).catch(e => e);

    expect(err.status).toBe(408);
    expect(err.message).toMatch(/timed-out/i);
  });

  it('keeps the original message when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.status).toBe(502);
    expect(err.message).toContain('Failed to fetch');
  });

  // A request that never produced a response has no body to read, so the failure path
  // must not try to parse one and report the parse error instead of the real cause.
  it('does not log a body parse failure when there was no response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abortError()))
    );

    await clusterRequest('/version').catch(() => {});

    const loggedParseFailure = consoleError.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('Unable to parse error json')
    );
    expect(loggedParseFailure).toBe(false);
  });

  it('still reads the message from a real error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'forbidden by RBAC' }), {
            status: 403,
            statusText: 'Forbidden',
          })
        )
      )
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.status).toBe(403);
    expect(err.message).toContain('forbidden by RBAC');
  });

  it('reports a network failure while reading a successful response body as 502', async () => {
    const response = new Response();
    const networkError = new TypeError('Failed to fetch');
    vi.spyOn(response, 'json').mockRejectedValue(networkError);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response))
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.status).toBe(502);
    expect(err.message).toContain('Failed to fetch');
  });

  it('preserves JSON syntax errors while reading a successful response body', async () => {
    const response = new Response();
    const syntaxError = new SyntaxError('Unexpected end of JSON input');
    vi.spyOn(response, 'json').mockRejectedValue(syntaxError);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response))
    );

    await expect(clusterRequest('/version')).rejects.toBe(syntaxError);
  });

  it('preserves a custom caller abort reason while reading the response body', async () => {
    const caller = new AbortController();
    const reason = new TypeError('application cancellation');
    const response = new Response();
    vi.spyOn(response, 'json').mockImplementation(() => {
      caller.abort(reason);
      return Promise.reject(reason);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response))
    );

    await expect(clusterRequest('/version', { signal: caller.signal })).rejects.toBe(reason);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps caller cancellation connected while a raw response body is pending', async () => {
    const caller = new AbortController();
    const removeAbortListener = vi.spyOn(caller.signal, 'removeEventListener');
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init.signal?.addEventListener(
                  'abort',
                  () => {
                    controller.error(abortError());
                  },
                  { once: true }
                );
              },
            })
          )
        )
      )
    );

    const response = await clusterRequest('/version', {
      signal: caller.signal,
      isJSON: false,
    });
    caller.abort();

    await expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('detaches caller cancellation after a raw response body closes', async () => {
    const caller = new AbortController();
    const removeAbortListener = vi.spyOn(caller.signal, 'removeEventListener');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok')))
    );

    const response = await clusterRequest('/version', {
      signal: caller.signal,
      isJSON: false,
    });

    await expect(response.text()).resolves.toBe('ok');
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('detaches caller cancellation when a raw response body is cancelled', async () => {
    const caller = new AbortController();
    const removeAbortListener = vi.spyOn(caller.signal, 'removeEventListener');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('unused')))
    );

    const response = await clusterRequest('/version', {
      signal: caller.signal,
      isJSON: false,
    });

    await response.body?.cancel();
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('detaches caller cancellation when a raw response body errors', async () => {
    const caller = new AbortController();
    const removeAbortListener = vi.spyOn(caller.signal, 'removeEventListener');
    const bodyError = new TypeError('body failed');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(bodyError);
              },
            })
          )
        )
      )
    );

    const response = await clusterRequest('/version', {
      signal: caller.signal,
      isJSON: false,
    });

    await expect(response.text()).rejects.toBe(bodyError);
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  // The message is rendered in the auth chooser, so the url belongs in the log only.
  it('keeps the url out of the message and in the log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(abortError()))
    );

    const err: ApiError = await clusterRequest('/version').catch(e => e);

    expect(err.message).not.toContain('http');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/timed-out/i),
      'at url:',
      expect.stringContaining('/version'),
      expect.anything()
    );
  });

  it('resolves the parsed body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ gitVersion: 'v1.31.0' }))))
    );

    await expect(clusterRequest('/version')).resolves.toEqual({ gitVersion: 'v1.31.0' });
  });
});
