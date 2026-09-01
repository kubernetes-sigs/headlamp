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

import { currentPluginName, setCurrentPluginName } from './pluginContext';

describe('pluginContext', () => {
  afterEach(() => {
    setCurrentPluginName(null);
  });

  it('defaults to null', () => {
    expect(currentPluginName).toBeNull();
  });

  it('reflects the most recent setCurrentPluginName call', () => {
    setCurrentPluginName('my-plugin');
    expect(currentPluginName).toBe('my-plugin');

    setCurrentPluginName('another-plugin');
    expect(currentPluginName).toBe('another-plugin');

    setCurrentPluginName(null);
    expect(currentPluginName).toBeNull();
  });

  it('is set during a synchronous plugin execution and cleared afterward, mirroring runPluginInner', () => {
    // Mirrors the try/finally wrapping runPluginInner puts around privateRunPlugin.
    function runSynchronously(packageName: string, fn: () => void) {
      setCurrentPluginName(packageName);
      try {
        fn();
      } finally {
        setCurrentPluginName(null);
      }
    }

    let observedDuringRun: string | null = null;
    runSynchronously('my-plugin', () => {
      observedDuringRun = currentPluginName;
    });

    expect(observedDuringRun).toBe('my-plugin');
    expect(currentPluginName).toBeNull();
  });

  it('is cleared even if the plugin throws synchronously', () => {
    function runSynchronously(packageName: string, fn: () => void) {
      setCurrentPluginName(packageName);
      try {
        fn();
      } finally {
        setCurrentPluginName(null);
      }
    }

    expect(() =>
      runSynchronously('bad-plugin', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(currentPluginName).toBeNull();
  });

  it('attributes each plugin only for the duration of its own sequential run', () => {
    function runSynchronously(packageName: string, fn: () => void) {
      setCurrentPluginName(packageName);
      try {
        fn();
      } finally {
        setCurrentPluginName(null);
      }
    }

    const observed: Array<string | null> = [];
    runSynchronously('plugin-a', () => observed.push(currentPluginName));
    observed.push(currentPluginName);
    runSynchronously('plugin-b', () => observed.push(currentPluginName));
    observed.push(currentPluginName);

    expect(observed).toEqual(['plugin-a', null, 'plugin-b', null]);
  });
});
