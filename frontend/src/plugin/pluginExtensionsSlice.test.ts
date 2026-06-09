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

import pluginExtensionsReducer, { addPluginExtension } from './pluginExtensionsSlice';

describe('pluginExtensionsSlice', () => {
  const initialState = {
    extensions: {},
  };

  it('should handle initial state', () => {
    expect(pluginExtensionsReducer(undefined, { type: '' })).toEqual(initialState);
  });

  it('should add an extension value', () => {
    const value = { id: 'example-extension' };
    const nextState = pluginExtensionsReducer(
      initialState,
      addPluginExtension({ extensionPoint: 'example.extensionPoint.v1', value })
    );

    expect(nextState.extensions['example.extensionPoint.v1']).toEqual({
      'example-extension': value,
    });
  });

  it('should replace an extension value with the same id', () => {
    const first = { id: 'example-extension', version: 1 };
    const second = { id: 'example-extension', version: 2 };
    let nextState = pluginExtensionsReducer(
      initialState,
      addPluginExtension({ extensionPoint: 'example.extensionPoint.v1', value: first })
    );
    nextState = pluginExtensionsReducer(
      nextState,
      addPluginExtension({ extensionPoint: 'example.extensionPoint.v1', value: second })
    );

    expect(nextState.extensions['example.extensionPoint.v1']).toEqual({
      'example-extension': second,
    });
  });

  it('should keep extension points isolated', () => {
    const first = { id: 'first-extension' };
    const second = { id: 'second-extension' };
    let nextState = pluginExtensionsReducer(
      initialState,
      addPluginExtension({ extensionPoint: 'example.firstExtensionPoint.v1', value: first })
    );
    nextState = pluginExtensionsReducer(
      nextState,
      addPluginExtension({ extensionPoint: 'example.secondExtensionPoint.v1', value: second })
    );

    expect(nextState.extensions['example.firstExtensionPoint.v1']).toEqual({
      'first-extension': first,
    });
    expect(nextState.extensions['example.secondExtensionPoint.v1']).toEqual({
      'second-extension': second,
    });
  });
});
