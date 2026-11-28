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
import { setConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { onSchemaCacheInvalidation } from './schemaCacheInvalidation';

describe('schema connection lifecycle wiring', () => {
  it('invalidates same-name replacements and removals but ignores equivalent config polls', () => {
    const original = store.getState().config.clusters;
    const notify = vi.fn();
    const unsubscribe = onSchemaCacheInvalidation(notify);
    try {
      store.dispatch(
        setConfig({ clusters: { lifecycle: { name: 'lifecycle', server: 'first' } } as any })
      );
      notify.mockClear();
      store.dispatch(
        setConfig({ clusters: { lifecycle: { name: 'lifecycle', server: 'first' } } as any })
      );
      expect(notify).not.toHaveBeenCalled();
      store.dispatch(
        setConfig({ clusters: { lifecycle: { name: 'lifecycle', server: 'replacement' } } as any })
      );
      expect(notify.mock.calls).toEqual([['lifecycle']]);
      notify.mockClear();
      store.dispatch(setConfig({ clusters: {} }));
      expect(notify.mock.calls).toEqual([['lifecycle']]);
    } finally {
      unsubscribe();
      store.dispatch(setConfig({ clusters: original }));
    }
  });
});
