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

import path from 'node:path';
import { Worker } from 'node:worker_threads';

const DETECTION_PENDING = 0;
const DETECTION_PHYSICAL = 1;
const DETECTION_VIRTUAL = 2;
const DETECTION_FAILED = 3;
const VM_IDENTIFIERS =
  /\b(?:amazon ec2|bochs|digitalocean|google compute engine|hyper-v|kvm|nutanix|parallels|qemu|virtual machine|virtualbox|vmware|xen)\b/i;

interface DetectionWorker {
  on(event: 'error', listener: () => void): void;
  unref(): void;
}

/** A Windows VM detection operation running outside the Electron main thread. */
export interface WindowsVMDetection {
  /** Shared state updated by the detection worker. */
  state: Int32Array;
}

/** Dependencies used to start VM detection, injectable for testing. */
export interface WindowsVMDetectionDependencies {
  /** Current operating system platform. */
  platform: NodeJS.Platform;
  /** Windows installation directory containing System32. */
  systemRoot: string;
  /** Starts an unreferenced worker from inline JavaScript. */
  createWorker: (source: string, workerData: object) => DetectionWorker;
}

const defaultDependencies: WindowsVMDetectionDependencies = {
  platform: process.platform,
  systemRoot: process.env.SystemRoot || 'C:\\Windows',
  createWorker(source, workerData) {
    return new Worker(source, { eval: true, workerData });
  },
};

/**
 * Starts Windows VM detection while the main process continues synchronous setup.
 *
 * @param disableGPU - Explicit command-line preference, when provided.
 * @param dependencies - Platform and worker operations.
 * @returns Shared detection state, or null when automatic detection is unnecessary.
 */
export function startWindowsVMDetection(
  disableGPU: boolean | undefined,
  dependencies: WindowsVMDetectionDependencies = defaultDependencies
): WindowsVMDetection | null {
  if (dependencies.platform !== 'win32' || disableGPU !== undefined) {
    return null;
  }

  const systemRoot = path.win32.isAbsolute(dependencies.systemRoot)
    ? dependencies.systemRoot
    : 'C:\\Windows';
  const state = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const source = `
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    const { workerData } = require('node:worker_threads');
    const state = new Int32Array(workerData.state);
    let result = workerData.failed;
    try {
      const output = execFileSync(
        path.win32.join(workerData.systemRoot, 'System32', 'reg.exe'),
        ['query', 'HKLM\\\\HARDWARE\\\\DESCRIPTION\\\\System\\\\BIOS'],
        {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: workerData.timeout,
          windowsHide: true,
        }
      );
      result = new RegExp(workerData.pattern, 'i').test(output)
        ? workerData.virtual
        : workerData.physical;
    } catch {
      result = workerData.failed;
    } finally {
      Atomics.store(state, 0, result);
      Atomics.notify(state, 0);
    }
  `;
  const worker = dependencies.createWorker(source, {
    failed: DETECTION_FAILED,
    pattern: VM_IDENTIFIERS.source,
    physical: DETECTION_PHYSICAL,
    state: state.buffer,
    systemRoot,
    timeout: 1000,
    virtual: DETECTION_VIRTUAL,
  });
  worker.on('error', () => {
    Atomics.store(state, 0, DETECTION_FAILED);
    Atomics.notify(state, 0);
  });
  worker.unref();

  return { state };
}

/**
 * Waits for a previously started VM detection before Electron becomes ready.
 *
 * @param detection - Detection state returned by startWindowsVMDetection.
 * @param timeoutMs - Maximum time to wait after synchronous startup work.
 * @returns Whether the Windows system was identified as a virtual machine.
 */
export function waitForWindowsVMDetection(
  detection: WindowsVMDetection | null,
  timeoutMs = 1000
): boolean {
  if (!detection) {
    return false;
  }

  Atomics.wait(detection.state, 0, DETECTION_PENDING, timeoutMs);
  return Atomics.load(detection.state, 0) === DETECTION_VIRTUAL;
}
