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

import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import {
  startWindowsVMDetection,
  waitForWindowsVMDetection,
  WindowsVMDetectionDependencies,
} from './hardwareAcceleration';

function dependencies(
  overrides: Partial<WindowsVMDetectionDependencies> = {}
): WindowsVMDetectionDependencies {
  return {
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    createWorker: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
    ...overrides,
  };
}

describe('startWindowsVMDetection', () => {
  it('starts an unreferenced worker on Windows when no flag is set', () => {
    const worker = { on: vi.fn(), unref: vi.fn() };
    const createWorker = vi.fn(() => worker);

    const detection = startWindowsVMDetection(undefined, dependencies({ createWorker }));

    expect(detection).not.toBeNull();
    expect(createWorker).toHaveBeenCalledWith(
      expect.stringContaining('execFileSync'),
      expect.objectContaining({ systemRoot: 'C:\\Windows' })
    );
    expect(worker.unref).toHaveBeenCalledTimes(1);
    expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it.each([true, false])('skips detection when disable-gpu is %s', disableGPU => {
    const createWorker = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }));

    expect(startWindowsVMDetection(disableGPU, dependencies({ createWorker }))).toBeNull();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('skips detection outside Windows', () => {
    const createWorker = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }));

    expect(
      startWindowsVMDetection(undefined, dependencies({ createWorker, platform: 'linux' }))
    ).toBeNull();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('falls back to the standard Windows directory for an invalid root', () => {
    const createWorker = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }));

    startWindowsVMDetection(undefined, dependencies({ createWorker, systemRoot: 'relative' }));

    expect(createWorker).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ systemRoot: 'C:\\Windows' })
    );
  });

  it('signals failure when the registry executable is unavailable', () => {
    const detection = startWindowsVMDetection(
      undefined,
      dependencies({
        createWorker(source, workerData) {
          return new Worker(source, { eval: true, workerData });
        },
        systemRoot: 'Z:\\missing-windows',
      })
    );

    expect(waitForWindowsVMDetection(detection)).toBe(false);
    expect(Atomics.load(detection!.state, 0)).not.toBe(0);
  });
});

describe('waitForWindowsVMDetection', () => {
  it('returns true only for virtual-machine results', () => {
    const virtualState = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const physicalState = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(virtualState, 0, 2);
    Atomics.store(physicalState, 0, 1);

    expect(waitForWindowsVMDetection({ state: virtualState })).toBe(true);
    expect(waitForWindowsVMDetection({ state: physicalState })).toBe(false);
    expect(waitForWindowsVMDetection(null)).toBe(false);
  });

  it('returns false when detection exceeds its bounded wait', () => {
    const state = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

    expect(waitForWindowsVMDetection({ state }, 1)).toBe(false);
  });
});
