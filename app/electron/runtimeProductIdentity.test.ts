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
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeApp = vi.hoisted(() => ({
  commandLine: { hasSwitch: vi.fn(() => false) },
  getName: vi.fn(() => 'Headlamp'),
  getPath: vi.fn(() => ''),
  isPackaged: false,
  setName: vi.fn(),
  setPath: vi.fn(),
}));

vi.mock('electron', () => ({ app: runtimeApp }));

import {
  applyRuntimeProductIdentity,
  pluginConfigDirName,
  resolveRuntimeBuildManifestPath,
} from './runtimeProductIdentity';

const defaultUserDataPath = path.join('Users', 'test', 'AppData', 'Headlamp');

describe('pluginConfigDirName', () => {
  it('shares the Headlamp plugin profile with development tooling', () => {
    expect(pluginConfigDirName('AKS Desktop', true)).toBe('Headlamp');
  });

  it('uses the branded plugin profile in packaged applications', () => {
    expect(pluginConfigDirName('AKS Desktop', false)).toBe('AKS Desktop');
  });
});

describe('applyRuntimeProductIdentity', () => {
  beforeEach(() => {
    runtimeApp.commandLine.hasSwitch.mockReturnValue(false);
    runtimeApp.getName.mockReturnValue('Headlamp');
    runtimeApp.getPath.mockReturnValue(defaultUserDataPath);
    runtimeApp.commandLine.hasSwitch.mockClear();
    runtimeApp.getName.mockClear();
    runtimeApp.getPath.mockClear();
    runtimeApp.setName.mockClear();
    runtimeApp.setPath.mockClear();
  });

  it('uses the product display name for the Electron runtime', () => {
    expect(
      applyRuntimeProductIdentity(runtimeApp, {
        product: { name: 'example-desktop', productName: 'Example Desktop' },
      })
    ).toBe('Example Desktop');
    expect(runtimeApp.setName).toHaveBeenCalledWith('Example Desktop');
    expect(runtimeApp.setPath).toHaveBeenCalledWith(
      'userData',
      path.join('Users', 'test', 'AppData', 'Example Desktop')
    );
  });

  it('preserves the package name when product metadata is absent', () => {
    expect(applyRuntimeProductIdentity(runtimeApp, {})).toBe('Headlamp');
    expect(runtimeApp.setName).not.toHaveBeenCalled();
    expect(runtimeApp.setPath).not.toHaveBeenCalled();
  });

  it('preserves an explicitly customized user data path', () => {
    runtimeApp.getPath.mockReturnValue('/tmp/custom-profile');

    expect(
      applyRuntimeProductIdentity(runtimeApp, { product: { productName: 'Example Desktop' } })
    ).toBe('Example Desktop');
    expect(runtimeApp.setName).toHaveBeenCalledWith('Example Desktop');
    expect(runtimeApp.setPath).not.toHaveBeenCalled();
  });

  it('preserves an explicit user data path with the package name', () => {
    runtimeApp.commandLine.hasSwitch.mockReturnValue(true);

    applyRuntimeProductIdentity(runtimeApp, {
      product: { productName: 'Example Desktop' },
    });

    expect(runtimeApp.setPath).not.toHaveBeenCalled();
  });
});

describe('resolveRuntimeBuildManifestPath', () => {
  it('uses an explicitly selected development manifest', () => {
    expect(
      resolveRuntimeBuildManifestPath(
        runtimeApp,
        { HEADLAMP_BUILD_MANIFEST: './product/manifest.json' },
        path.join('workspace', 'app'),
        path.join('packaged', 'resources')
      )
    ).toBe(path.resolve('workspace', 'app', 'product', 'manifest.json'));
  });

  it('uses the packaged resources manifest instead of a development override', () => {
    runtimeApp.isPackaged = true;

    expect(
      resolveRuntimeBuildManifestPath(
        runtimeApp,
        { HEADLAMP_BUILD_MANIFEST: './product/manifest.json' },
        path.join('workspace', 'app'),
        path.join('packaged', 'resources')
      )
    ).toBe(path.join('packaged', 'resources', 'app-build-manifest.json'));

    runtimeApp.isPackaged = false;
  });
});
