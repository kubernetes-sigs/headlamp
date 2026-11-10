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

import { act, render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useHistory } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as isElectronModule from '../../helpers/isElectron';
import { isValidRedirectPath, RouteZoomSync } from './AppContainer';

describe('isValidRedirectPath', () => {
  it('should allow safe internal paths', () => {
    expect(isValidRedirectPath('/dashboard')).toBe(true);
    expect(isValidRedirectPath('/settings/cluster')).toBe(true);
    expect(isValidRedirectPath('../settings')).toBe(true);
    expect(isValidRedirectPath('./relative')).toBe(true);
  });

  it('should block external HTTP URLs', () => {
    expect(isValidRedirectPath('http://malicious-site.com')).toBe(false);
    expect(isValidRedirectPath('http://evil.com/path')).toBe(false);
  });

  it('should block external HTTPS URLs', () => {
    expect(isValidRedirectPath('https://evil.com')).toBe(false);
    expect(isValidRedirectPath('https://malicious.com/path')).toBe(false);
  });

  it('should block protocol-relative URLs', () => {
    expect(isValidRedirectPath('//malicious.com')).toBe(false);
    expect(isValidRedirectPath('//evil.com/path')).toBe(false);
  });

  it('should block dangerous protocols', () => {
    expect(isValidRedirectPath('javascript:alert("XSS")')).toBe(false);
    expect(isValidRedirectPath('data:text/html,<script>alert("XSS")</script>')).toBe(false);
    expect(isValidRedirectPath('vbscript:msgbox("XSS")')).toBe(false);
    expect(isValidRedirectPath('file:///etc/passwd')).toBe(false);
    expect(isValidRedirectPath('ftp://malicious.com')).toBe(false);
  });

  it('should block empty or null paths', () => {
    expect(isValidRedirectPath('')).toBe(false);
    expect(isValidRedirectPath('   ')).toBe(false);
    expect(isValidRedirectPath(null as any)).toBe(false);
    expect(isValidRedirectPath(undefined as any)).toBe(false);
  });

  it('should block URL-encoded protocol bypass attempts', () => {
    expect(isValidRedirectPath('java%73cript:alert("XSS")')).toBe(false);
    expect(isValidRedirectPath('%64ata:text/html,<script>alert("XSS")</script>')).toBe(false);
    expect(isValidRedirectPath('javascript%3Aalert("XSS")')).toBe(false);
    expect(() => isValidRedirectPath('%zz')).not.toThrow();
    expect(isValidRedirectPath('%zz')).toBe(true);
  });

  it('should block scheme-based URLs without //', () => {
    expect(isValidRedirectPath('http:evil.com')).toBe(false);
    expect(isValidRedirectPath('https:evil.com')).toBe(false);
  });

  it('should block paths with leading whitespace containing dangerous protocols', () => {
    expect(isValidRedirectPath(' javascript:alert("XSS")')).toBe(false);
    expect(isValidRedirectPath('\tdata:text/html,<script>alert("XSS")</script>')).toBe(false);
    expect(isValidRedirectPath('\njavascript:void(0)')).toBe(false);
  });

  it('should allow valid paths with special characters', () => {
    expect(isValidRedirectPath('/dashboard?tab=overview')).toBe(true);
    expect(isValidRedirectPath('/settings/cluster#section')).toBe(true);
    expect(isValidRedirectPath('/namespaces/default/pods?labelSelector=app%3Dnginx')).toBe(true);
  });

  it('should block protocol-relative URLs with whitespace', () => {
    expect(isValidRedirectPath(' //malicious.com')).toBe(false);
    expect(isValidRedirectPath('\t//evil.com/path')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isValidRedirectPath('/')).toBe(true);
    expect(isValidRedirectPath('/a')).toBe(true);
    expect(isValidRedirectPath('javascript')).toBe(true);
    expect(isValidRedirectPath('data')).toBe(true);
  });
});

function NavigationHarness({ onNavigate }: { onNavigate?: (nav: (path: string) => void) => void }) {
  const history = useHistory();
  React.useEffect(() => {
    onNavigate?.((path: string) => history.push(path));
  }, [history, onNavigate]);
  return <RouteZoomSync />;
}

describe('RouteZoomSync', () => {
  let originalDesktopApi: any;
  let rafCallbacks: { [id: number]: FrameRequestCallback } = {};
  let nextRafId = 1;

  function runNextFrame() {
    const ids = Object.keys(rafCallbacks).map(Number);
    if (ids.length > 0) {
      const firstId = ids[0];
      const cb = rafCallbacks[firstId];
      delete rafCallbacks[firstId];
      cb(performance.now());
    }
  }

  function flushFrames() {
    let loops = 0;
    while (Object.keys(rafCallbacks).length > 0 && loops < 50) {
      runNextFrame();
      loops++;
    }
  }

  beforeEach(() => {
    originalDesktopApi = window.desktopApi;
    rafCallbacks = {};
    nextRafId = 1;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      const id = nextRafId++;
      rafCallbacks[id] = cb;
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      delete rafCallbacks[id];
    });
  });

  afterEach(() => {
    window.desktopApi = originalDesktopApi;
    vi.restoreAllMocks();
  });

  it('should not request animation frames or send route-changed when not in Electron', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(false);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteZoomSync />
      </MemoryRouter>
    );

    flushFrames();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('should not request animation frames when desktopApi is missing', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    delete (window as any).desktopApi;

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteZoomSync />
      </MemoryRouter>
    );

    flushFrames();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('should send route-changed after double requestAnimationFrame on mount', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteZoomSync />
      </MemoryRouter>
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(Object.keys(rafCallbacks)).toHaveLength(1);

    // First frame resolves, schedules inner frame
    runNextFrame();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(Object.keys(rafCallbacks)).toHaveLength(1);

    // Second frame resolves, sends route-changed
    runNextFrame();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith('route-changed');
  });

  it('should send route-changed after route transitions', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    let navigate: (path: string) => void = () => {};

    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationHarness
          onNavigate={n => {
            navigate = n;
          }}
        />
      </MemoryRouter>
    );

    flushFrames();
    expect(sendSpy).toHaveBeenCalledTimes(1);

    act(() => {
      navigate('/namespaces/default/pods');
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    flushFrames();
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenLastCalledWith('route-changed');
  });

  it('should cancel outer frame on unmount to suppress stale sends', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteZoomSync />
      </MemoryRouter>
    );

    unmount();
    flushFrames();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should cancel inner frame on unmount to suppress stale sends', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteZoomSync />
      </MemoryRouter>
    );

    runNextFrame(); // Outer frame executed, inner frame scheduled
    unmount();
    flushFrames();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should cancel pending frames and suppress stale sends on rapid route changes', () => {
    vi.spyOn(isElectronModule, 'isElectron').mockReturnValue(true);
    const sendSpy = vi.fn();
    window.desktopApi = { send: sendSpy } as any;

    let navigate: (path: string) => void = () => {};

    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationHarness
          onNavigate={n => {
            navigate = n;
          }}
        />
      </MemoryRouter>
    );

    // Initial mount schedules outer frame
    expect(sendSpy).not.toHaveBeenCalled();

    // Rapidly navigate to a new route before first frame resolves
    act(() => {
      navigate('/route-1');
    });

    // Run 1 frame (resolves outer frame for /route-1, schedules inner frame)
    runNextFrame();
    expect(sendSpy).not.toHaveBeenCalled();

    // Rapidly navigate to another route before inner frame resolves
    act(() => {
      navigate('/route-2');
    });

    // Outer & inner frames for /route-1 were cancelled when navigating to /route-2
    // Now flush all remaining frames for /route-2
    flushFrames();

    // Exactly 1 call should have been made (for /route-2 only, initial and /route-1 suppressed)
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith('route-changed');
  });
});
