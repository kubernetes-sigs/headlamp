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

import { describe, expect, it } from 'vitest';
import { setConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { ConfigStore } from './configStore';

function setServerDefaults(plugins: { [configKey: string]: { [key: string]: any } } | undefined) {
  store.dispatch(setConfig({ clusters: {}, plugins }));
}

describe('ConfigStore server defaults', () => {
  it('falls back to the user value when the server has no defaults for this plugin', () => {
    setServerDefaults(undefined);

    const configStore = new ConfigStore<{ address: string }>('user-only');
    configStore.set({ address: 'user/prometheus:9090' });

    expect(configStore.get()).toEqual({ address: 'user/prometheus:9090' });
  });

  it('merges server defaults with user overrides, user winning on shared keys', () => {
    setServerDefaults({ merged: { address: 'monitoring/prometheus:9090', autoDetect: false } });

    const configStore = new ConfigStore<{ address: string; autoDetect: boolean }>('merged');
    configStore.update({ address: 'other/prometheus:9090' });

    expect(configStore.get()).toEqual({ address: 'other/prometheus:9090', autoDetect: false });
  });
});
