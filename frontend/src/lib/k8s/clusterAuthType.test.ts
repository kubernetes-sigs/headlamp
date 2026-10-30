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

/*
 * Copyright 2026 The Kubernetes Authors
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
import store from '../../redux/stores/store';
import { canLogoutFromProvider, getClusterAuthType } from './clusterAuthType';

describe('getClusterAuthType', () => {
  it.each(['clusters', 'statelessClusters', 'allClusters'] as const)(
    'recognizes OIDC authentication from %s',
    key => {
      const state = store.getState();
      const spy = vi.spyOn(store, 'getState').mockReturnValue({
        ...state,
        config: { ...state.config, [key]: { sample: { name: 'sample', auth_type: 'oidc' } } },
      });
      expect(getClusterAuthType('sample')).toBe('oidc');
      expect(canLogoutFromProvider('sample')).toBe(key !== 'statelessClusters');
      spy.mockRestore();
    }
  );
  it('preserves stateless override precedence for a shared cluster name', () => {
    const state = store.getState();
    const spy = vi.spyOn(store, 'getState').mockReturnValue({
      ...state,
      config: {
        ...state.config,
        clusters: { sample: { name: 'sample', auth_type: 'oidc' } },
        statelessClusters: { sample: { name: 'sample', auth_type: '' } },
      },
    });
    expect(getClusterAuthType('sample')).toBe('');
    spy.mockRestore();
  });
  it('keeps a stateless OIDC override local-only even with a same-named global provider', () => {
    const state = store.getState();
    const spy = vi.spyOn(store, 'getState').mockReturnValue({
      ...state,
      config: {
        ...state.config,
        clusters: { sample: { name: 'sample', auth_type: 'oidc' } },
        statelessClusters: { sample: { name: 'sample', auth_type: 'oidc' } },
      },
    });
    expect(canLogoutFromProvider('sample')).toBe(false);
    spy.mockRestore();
  });
});
