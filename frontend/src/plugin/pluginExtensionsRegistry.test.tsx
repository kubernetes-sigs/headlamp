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

import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import store from '../redux/stores/store';
import { getPluginExtensions, registerPluginExtension, usePluginExtensions } from './registry';

function wrapper({ children }: PropsWithChildren) {
  return <Provider store={store}>{children}</Provider>;
}

describe('plugin extension registry', () => {
  it('registers and returns plugin extensions', () => {
    const extensionPoint = 'test.registry.example.v1';
    const value = { id: 'example-extension', label: 'Example Extension' };

    registerPluginExtension(extensionPoint, value);

    expect(getPluginExtensions(extensionPoint)).toEqual([value]);
  });

  it('replaces an extension with the same id', () => {
    const extensionPoint = 'test.registry.replace.v1';
    const first = { id: 'example-extension', version: 1 };
    const second = { id: 'example-extension', version: 2 };

    registerPluginExtension(extensionPoint, first);
    registerPluginExtension(extensionPoint, second);

    expect(getPluginExtensions(extensionPoint)).toEqual([second]);
  });

  it('keeps extension points isolated', () => {
    const first = { id: 'first-extension' };
    const second = { id: 'second-extension' };

    registerPluginExtension('test.registry.first.v1', first);
    registerPluginExtension('test.registry.second.v1', second);

    expect(getPluginExtensions('test.registry.first.v1')).toEqual([first]);
    expect(getPluginExtensions('test.registry.second.v1')).toEqual([second]);
  });

  it('updates hook consumers when an extension registers', () => {
    const extensionPoint = 'test.registry.hook.v1';
    const value = { id: 'example-extension' };

    const { result } = renderHook(() => usePluginExtensions(extensionPoint), { wrapper });

    expect(result.current).toEqual([]);

    act(() => {
      registerPluginExtension(extensionPoint, value);
    });

    expect(result.current).toEqual([value]);
  });
});
