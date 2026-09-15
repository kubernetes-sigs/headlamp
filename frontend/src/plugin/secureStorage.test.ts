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
import { createPluginSecureStorage, getPluginSecureStorageNamespace } from './secureStorage';

describe('getPluginSecureStorageNamespace', () => {
  it('uses trusted installation metadata instead of the manifest name', () => {
    expect(
      getPluginSecureStorageNamespace({
        folderName: 'github-auth',
        source: 'shipped',
        type: 'shipped',
      })
    ).toBe('shipped--github-auth');
    expect(
      getPluginSecureStorageNamespace({
        folderName: 'github-auth',
        source: 'user',
        type: 'user',
      })
    ).toBe('user--github-auth');
  });

  it('uses the inventory source when migration changes the plugin type', () => {
    expect(
      getPluginSecureStorageNamespace({
        folderName: 'github-auth',
        source: 'development',
        type: 'user',
      })
    ).toBe('development--github-auth');
  });

  it('rejects incomplete installation metadata', () => {
    expect(getPluginSecureStorageNamespace({ folderName: 'github-auth' })).toBeUndefined();
    expect(getPluginSecureStorageNamespace({ source: 'shipped' })).toBeUndefined();
  });
});

describe('createPluginSecureStorage', () => {
  it('binds every operation to the plugin capability', async () => {
    const bridge = {
      save: vi.fn().mockResolvedValue({ success: true }),
      load: vi.fn().mockResolvedValue({ success: true, value: 'value' }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };
    const storage = createPluginSecureStorage('capability', bridge);

    await storage.save('key', 'value');
    await storage.load('key');
    await storage.delete('key');

    expect(bridge.save).toHaveBeenCalledWith('capability', 'key', 'value');
    expect(bridge.load).toHaveBeenCalledWith('capability', 'key');
    expect(bridge.delete).toHaveBeenCalledWith('capability', 'key');
    expect(Object.isFrozen(storage)).toBe(true);
  });
});
