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

import * as getAppUrl from './getAppUrl';
import * as isDevMode from './isDevMode';
import * as isElectron from './isElectron';

describe('getAppUrl', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  const windowSpy = vi.spyOn<any, any>(window, 'window', 'get');

  test('dev mode', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => true);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => false);
    expect(getAppUrl.getAppUrl()).toBe('http://localhost:4466/');
  });
  test('dev mode and isElectron', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => true);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => true);
    expect(getAppUrl.getAppUrl()).toBe('http://localhost:4466/');
  });
  test('isElectron, not dev mode', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => false);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => true);
    expect(getAppUrl.getAppUrl()).toBe('http://localhost:4466/');
  });

  test('base-url is set through headlampBaseUrl variable', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => true);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => false);

    windowSpy.mockImplementation(() => ({
      headlampBaseUrl: '/headlamp',
    }));
    expect(getAppUrl.getAppUrl()).toBe('http://localhost:4466/headlamp/');
  });

  test('isElectron does not use a base-url set', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => false);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => true);

    windowSpy.mockImplementation(() => ({
      headlampBaseUrl: '/headlamp',
    }));
    expect(getAppUrl.getAppUrl()).toBe('http://localhost:4466/');
  });

  test('base-url is used without dev mode and without isElectron, uses window.location.origin', () => {
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => false);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => false);

    windowSpy.mockImplementation(() => ({
      headlampBaseUrl: '/headlamp',
      location: {
        origin: 'http://example.com:4466',
      },
    }));
    expect(getAppUrl.getAppUrl()).toBe('http://example.com:4466/headlamp/');
  });

  test('When headlampBaseUrl is set to "." it uses no base-url', () => {
    // This can happen with the Create React App build process which optimizes the "./" to "."
    vi.spyOn(isDevMode, 'isDevMode').mockImplementation(() => false);
    vi.spyOn(isElectron, 'isElectron').mockImplementation(() => false);

    windowSpy.mockImplementation(() => ({
      headlampBaseUrl: '.',
      location: {
        origin: 'http://example.com:4466',
      },
    }));
    expect(getAppUrl.getAppUrl()).toBe('http://example.com:4466/');
  });
});
