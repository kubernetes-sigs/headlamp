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

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { connectStreamWithParams } from './streamingApi';

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(),
}));

describe('connectStreamWithParams', () => {
  let WebSocketSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    WebSocketSpy = vi.fn();
    vi.stubGlobal('WebSocket', WebSocketSpy);
    (getUserIdFromLocalStorage as Mock).mockReturnValue('test-user-id');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls onFail and returns null socket without constructing WebSocket when cluster is empty string', async () => {
    const cb = vi.fn();
    const onFail = vi.fn();

    const result = await connectStreamWithParams('/api/v1/pods', cb, onFail, { cluster: '' });

    expect(WebSocketSpy).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(result.socket).toBeNull();
    expect(typeof result.close).toBe('function');
  });

  it('calls onFail and returns null socket without constructing WebSocket when cluster is omitted', async () => {
    const cb = vi.fn();
    const onFail = vi.fn();

    const result = await connectStreamWithParams('/api/v1/pods', cb, onFail, {});

    expect(WebSocketSpy).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(result.socket).toBeNull();
    expect(typeof result.close).toBe('function');
  });
});
