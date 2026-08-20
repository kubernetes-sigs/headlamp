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
import { getHardwareAccelerationDisableReason, isWindowsVM } from './hardwareAcceleration';

describe('isWindowsVM', () => {
  it.each([
    'SystemManufacturer    REG_SZ    Microsoft Corporation\nSystemProductName    REG_SZ    Virtual Machine',
    'SystemManufacturer    REG_SZ    VMware, Inc.',
    'SystemProductName    REG_SZ    VirtualBox',
    'SystemManufacturer    REG_SZ    QEMU',
  ])('detects a virtual machine from Windows BIOS data', bios => {
    expect(isWindowsVM('win32', () => bios)).toBe(true);
  });

  it('does not identify physical Windows hardware as a VM', () => {
    expect(
      isWindowsVM(
        'win32',
        () =>
          'SystemManufacturer    REG_SZ    Microsoft Corporation\nSystemProductName    REG_SZ    Surface Pro 9'
      )
    ).toBe(false);
  });

  it('does not query the BIOS on other platforms', () => {
    const readBIOS = vi.fn();

    expect(isWindowsVM('linux', readBIOS)).toBe(false);
    expect(readBIOS).not.toHaveBeenCalled();
  });

  it('returns false and keeps GPU enabled when the BIOS cannot be queried', () => {
    expect(
      isWindowsVM('win32', () => {
        throw new Error('reg.exe failed');
      })
    ).toBe(false);
  });
});

describe('getHardwareAccelerationDisableReason', () => {
  it('disables GPU acceleration in a Windows VM', () => {
    expect(getHardwareAccelerationDisableReason(undefined, 'win32', 'x64', () => true)).toContain(
      'Windows virtual machine'
    );
  });

  it('allows --disable-gpu=false to override automatic detection', () => {
    const detectWindowsVM = vi.fn(() => true);

    expect(getHardwareAccelerationDisableReason(false, 'win32', 'x64', detectWindowsVM)).toBe(
      undefined
    );
    expect(detectWindowsVM).not.toHaveBeenCalled();
  });

  it('preserves Linux ARM detection', () => {
    expect(getHardwareAccelerationDisableReason(undefined, 'linux', 'arm64')).toContain(
      'Linux on ARM'
    );
  });
});
