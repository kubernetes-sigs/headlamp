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

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePluginRefreshCheck } from './usePluginRefreshCheck';

vi.mock('../helpers/debugVerbose', () => ({
  isDebugVerbose: vi.fn(),
  debugVerbose: vi.fn(),
}));

describe('usePluginRefreshCheck', () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers(),
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should set up polling with configured interval and call fetch', async () => {
    let intervalCallback: (() => Promise<void>) | undefined;

    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation((cb: Function) => {
      intervalCallback = cb as () => Promise<void>;
      return 123 as any;
    });

    const pollInterval = 1000;
    renderHook(() => usePluginRefreshCheck(true, pollInterval));

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), pollInterval);
    expect(intervalCallback).toBeDefined();

    if (intervalCallback) {
      await intervalCallback();
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0].toString();
    expect(calledUrl).toContain('plugin-refresh');
  });

  it('should not set interval when enabled is false', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    renderHook(() => usePluginRefreshCheck(false));
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully', async () => {
    const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const debugVerboseModule = await import('../helpers/debugVerbose');
    vi.mocked(debugVerboseModule.isDebugVerbose).mockReturnValue(true);

    let intervalCallback: (() => Promise<void>) | undefined;
    vi.spyOn(global, 'setInterval').mockImplementation((cb: Function) => {
      intervalCallback = cb as () => Promise<void>;
      return 123 as any;
    });

    fetchSpy.mockRejectedValue(new Error('Network error'));

    renderHook(() => usePluginRefreshCheck(true, 1000));

    if (intervalCallback) {
      await intervalCallback();
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith('Plugin refresh check failed:', expect.any(Error));
  });

  it('should clean up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    vi.spyOn(global, 'setInterval').mockReturnValue(999 as any);

    const { unmount } = renderHook(() => usePluginRefreshCheck(true, 1000));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(999);
  });
});
