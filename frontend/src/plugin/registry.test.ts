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

import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackendThemeConfig } from '../components/App/themeSlice';
import type { ClusterPreOpenHook } from '../redux/clusterProviderSlice';
import reducers from '../redux/reducers/reducers';
import {
  hasClusterPreOpenHooks,
  resetClusterPreOpenHooksForTests,
  runClusterPreOpenHooks,
} from './clusterPreOpen';

let activeStore: any;

vi.mock('../redux/stores/store', () => {
  return {
    default: {
      dispatch: (action: any) => activeStore.dispatch(action),
      getState: () => activeStore.getState(),
      subscribe: (listener: any) => activeStore.subscribe(listener),
    },
  };
});

vi.mock('../components/resourceMap/sources/definitions/relationIds', () => ({
  BUILT_IN_RELATION_IDS: ['owner', 'owner-reversed', 'pod-configmap'],
}));

import {
  registerAppTheme,
  registerClusterEmptyState,
  registerClusterProviderPreOpen,
  registerResourceRelationProvider,
} from './registry';

describe('registerResourceRelationProvider', () => {
  let warnSpy: any;

  beforeEach(() => {
    resetClusterPreOpenHooksForTests();
    activeStore = configureStore({
      reducer: reducers,
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetClusterPreOpenHooksForTests();
    warnSpy.mockRestore();
  });

  it('should validate invalid relation objects and print warnings', () => {
    // 1. null/undefined relation
    registerResourceRelationProvider(null as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 2. Missing id
    registerResourceRelationProvider({
      fromSource: 'apps/Deployment',
      predicate: () => true,
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 3. Empty id
    registerResourceRelationProvider({
      id: '',
      fromSource: 'apps/Deployment',
      predicate: () => true,
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 4. Missing fromSource
    registerResourceRelationProvider({
      id: 'test-relation',
      predicate: () => true,
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 5. Empty fromSource
    registerResourceRelationProvider({
      id: 'test-relation',
      fromSource: '',
      predicate: () => true,
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 6. Missing predicate
    registerResourceRelationProvider({
      id: 'test-relation',
      fromSource: 'apps/Deployment',
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
    warnSpy.mockClear();

    // 7. Non-function predicate
    registerResourceRelationProvider({
      id: 'test-relation',
      fromSource: 'apps/Deployment',
      predicate: 'not-a-function',
    } as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid relation registration'));
  });

  it('should validate toSource and label and print warnings', () => {
    // 1. Invalid toSource (non-string)
    registerResourceRelationProvider({
      id: 'test-tosource-invalid',
      fromSource: 'apps/Deployment',
      toSource: 123 as any,
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('if "toSource" is provided, it must be a non-empty string')
    );
    warnSpy.mockClear();

    // 2. Empty toSource
    registerResourceRelationProvider({
      id: 'test-tosource-empty',
      fromSource: 'apps/Deployment',
      toSource: '',
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('if "toSource" is provided, it must be a non-empty string')
    );
    warnSpy.mockClear();

    // 3. Invalid label (non-string)
    registerResourceRelationProvider({
      id: 'test-label-invalid',
      fromSource: 'apps/Deployment',
      label: {} as any,
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('if "label" is provided, it must be a non-empty string')
    );
    warnSpy.mockClear();

    // 4. Empty label
    registerResourceRelationProvider({
      id: 'test-label-empty',
      fromSource: 'apps/Deployment',
      label: '',
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('if "label" is provided, it must be a non-empty string')
    );
  });

  it('should not register built-in relation IDs', () => {
    // 1. Starts with "owner-"
    registerResourceRelationProvider({
      id: 'owner-test',
      fromSource: 'apps/Deployment',
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('collides with a built-in relation ID')
    );
    warnSpy.mockClear();

    // 2. Starts with "owner-reversed-"
    registerResourceRelationProvider({
      id: 'owner-reversed-test',
      fromSource: 'apps/Deployment',
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('collides with a built-in relation ID')
    );
    warnSpy.mockClear();

    // 3. Exact match with built-in non-owner ID
    registerResourceRelationProvider({
      id: 'pod-configmap',
      fromSource: 'Pod',
      predicate: () => true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('collides with a built-in relation ID')
    );
  });

  it('should successfully register a valid relation and prevent duplicates', () => {
    const validRelation = {
      id: 'my-plugin.test-relation',
      fromSource: 'apps/Deployment',
      toSource: 'Secret',
      predicate: () => true,
      label: 'Uses Secret',
    };

    registerResourceRelationProvider(validRelation);
    expect(warnSpy).not.toHaveBeenCalled();

    const relations = activeStore.getState().graphView.relations;
    const addedRelation = relations.find((r: any) => r.id === validRelation.id);
    expect(addedRelation).toBeDefined();
    expect(addedRelation?.fromSource).toBe(validRelation.fromSource);

    // Try to register the same relation again (duplicate check)
    registerResourceRelationProvider(validRelation);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists. Skipping'));
  });

  it('registers a custom cluster empty state', () => {
    const emptyState = vi.fn(() => null);

    registerClusterEmptyState(emptyState);

    expect(activeStore.getState().clusterProvider.clusterEmptyState).toBe(emptyState);
  });

  it('keeps pre-open callbacks out of Redux state', async () => {
    const hook = vi.fn(async () => {});

    registerClusterProviderPreOpen(hook);

    const state = activeStore.getState().clusterProvider;
    expect(state).not.toHaveProperty('preOpenHooks');
    expect(state.preOpenHooksRevision).toBe(1);
    expect(hasClusterPreOpenHooks()).toBe(true);
    const context = { cluster: 'test', clusterConf: null };
    await runClusterPreOpenHooks(context, () => {});
    expect(hook).toHaveBeenCalledWith(context);
  });

  it('registers the same pre-open callback only once', async () => {
    const hook = vi.fn(async () => {});

    registerClusterProviderPreOpen(hook);
    registerClusterProviderPreOpen(hook);

    expect(activeStore.getState().clusterProvider.preOpenHooksRevision).toBe(1);
    await runClusterPreOpenHooks({ cluster: 'test', clusterConf: null }, () => {});
    expect(hook).toHaveBeenCalledOnce();
  });

  it('does not expose hooks through replaced array methods', async () => {
    const hook = vi.fn(async () => {});
    const originalPush = Array.prototype.push;
    const originalIndexOf = Array.prototype.indexOf;
    const originalSlice = Array.prototype.slice;
    const originalIterator = Array.prototype[Symbol.iterator];
    const captured: unknown[] = [];
    Array.prototype.push = function (...items: unknown[]) {
      if (items.includes(hook)) {
        Reflect.apply(originalPush, captured, items);
      }
      return Reflect.apply(originalPush, this, items);
    };
    Array.prototype.indexOf = function (item: unknown, fromIndex?: number) {
      if (item === hook) {
        Reflect.apply(originalPush, captured, [hook]);
      }
      return Reflect.apply(originalIndexOf, this, [item, fromIndex]);
    };
    Array.prototype.slice = function (...args: unknown[]) {
      if (Reflect.apply(originalSlice, this, []).includes(hook)) {
        Reflect.apply(originalPush, captured, [hook]);
      }
      return Reflect.apply(originalSlice, this, args);
    };
    Array.prototype[Symbol.iterator] = function () {
      const values = Reflect.apply(originalSlice, this, []);
      if (Reflect.apply(originalSlice, values, []).includes(hook)) {
        Reflect.apply(originalPush, captured, [hook]);
      }
      return Reflect.apply(originalIterator, this, []);
    };

    try {
      registerClusterProviderPreOpen(hook);
      await runClusterPreOpenHooks({ cluster: 'test', clusterConf: null }, () => {});
      expect(captured).toEqual([]);
    } finally {
      Array.prototype.push = originalPush;
      Array.prototype.indexOf = originalIndexOf;
      Array.prototype.slice = originalSlice;
      Array.prototype[Symbol.iterator] = originalIterator;
    }
  });

  it('gives each pre-open hook an independent context snapshot', async () => {
    let retainedContext: any;
    const firstHook = vi.fn<ClusterPreOpenHook>(async context => {
      retainedContext = context;
      retainedContext.cluster = 'attacker-cluster';
      retainedContext.clusterConf.meta_data.subscriptionId = 'attacker-subscription';
    });
    const secondHook = vi.fn<ClusterPreOpenHook>(async () => {});
    registerClusterProviderPreOpen(firstHook);
    registerClusterProviderPreOpen(secondHook);
    const context = {
      cluster: 'trusted-cluster',
      clusterConf: { meta_data: { subscriptionId: 'trusted-subscription' } },
    };

    await runClusterPreOpenHooks(context, () => {});

    expect(secondHook).toHaveBeenCalledWith({
      cluster: 'trusted-cluster',
      clusterConf: { meta_data: { subscriptionId: 'trusted-subscription' } },
      reportProgress: undefined,
      signal: undefined,
    });
    expect(secondHook.mock.calls[0][0]).not.toBe(retainedContext);
    expect(secondHook.mock.calls[0][0].clusterConf).not.toBe(retainedContext.clusterConf);
  });

  it('does not invoke a hook when preparation is already aborted', async () => {
    const hook = vi.fn(async () => {});
    const controller = new AbortController();
    const reason = new DOMException('Left cluster', 'AbortError');
    controller.abort(reason);
    registerClusterProviderPreOpen(hook);

    await expect(
      runClusterPreOpenHooks(
        { cluster: 'test', clusterConf: null, signal: controller.signal },
        () => {}
      )
    ).rejects.toBe(reason);
    expect(hook).not.toHaveBeenCalled();
  });

  it('uses AbortError when an abort signal provides no reason', async () => {
    const hook = vi.fn<ClusterPreOpenHook>(() => new Promise<void>(() => {}));
    registerClusterProviderPreOpen(hook);
    const createSignal = (aborted: boolean) => {
      const signal = new EventTarget();
      Object.defineProperties(signal, {
        aborted: { value: aborted },
        reason: { value: undefined },
      });
      return signal as AbortSignal;
    };

    await expect(
      runClusterPreOpenHooks(
        { cluster: 'test', clusterConf: null, signal: createSignal(true) },
        () => {}
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(hook).not.toHaveBeenCalled();

    const signal = createSignal(false);
    const preparation = runClusterPreOpenHooks(
      { cluster: 'test', clusterConf: null, signal },
      () => {}
    );
    signal.dispatchEvent(new Event('abort'));

    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    expect(hook).toHaveBeenCalledOnce();
  });
});

describe('registerAppTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (localStorage as any).headlampThemePreference;
    activeStore = configureStore({ reducer: reducers });
  });

  afterEach(() => {
    localStorage.clear();
    delete (localStorage as any).headlampThemePreference;
  });

  it.each([undefined, { default: false }])(
    'registers without selecting when options are %j',
    options => {
      const currentTheme = activeStore.getState().theme.name;

      registerAppTheme({ name: 'Product Theme', base: 'light' }, options);

      expect(activeStore.getState().theme.name).toBe(currentTheme);
      expect(localStorage.headlampThemePreference).toBeUndefined();
    }
  );

  it('selects a registered first-run default after backend config loads', () => {
    registerAppTheme({ name: 'Product Theme', base: 'light' }, { default: true });

    expect(activeStore.getState().theme.name).not.toBe('Product Theme');
    expect(localStorage.headlampThemePreference).toBeUndefined();

    activeStore.dispatch(applyBackendThemeConfig({}));

    expect(activeStore.getState().theme.name).toBe('Product Theme');
    expect(localStorage.headlampThemePreference).toBe('Product Theme');
  });

  it.each(['before', 'after'])(
    'keeps the first default when config loads %s registration',
    order => {
      if (order === 'before') {
        activeStore.dispatch(applyBackendThemeConfig({}));
      }

      registerAppTheme({ name: 'First Theme', base: 'light' }, { default: true });
      registerAppTheme({ name: 'Second Theme', base: 'dark' }, { default: true });

      if (order === 'after') {
        activeStore.dispatch(applyBackendThemeConfig({}));
      }

      expect(activeStore.getState().theme.name).toBe('First Theme');
      expect(activeStore.getState().theme.pluginDefault).toBe('First Theme');
      expect(localStorage.headlampThemePreference).toBe('First Theme');
    }
  );

  it('does not replace a forced theme when registered after config loads', () => {
    activeStore.dispatch(applyBackendThemeConfig({ forceTheme: 'Corporate Theme' }));

    registerAppTheme({ name: 'Product Theme', base: 'light' }, { default: true });

    expect(activeStore.getState().theme.name).toBe('Corporate Theme');
    expect(localStorage.headlampThemePreference).toBeUndefined();
  });

  it('preserves an existing user theme preference', () => {
    localStorage.setItem('headlampThemePreference', 'Dark');
    const currentTheme = activeStore.getState().theme.name;

    registerAppTheme({ name: 'Product Theme', base: 'light' }, { default: true });

    expect(activeStore.getState().theme.name).toBe(currentTheme);
    expect(localStorage.getItem('headlampThemePreference')).toBe('Dark');
  });

  it('overrides a backend default applied before plugin registration', () => {
    (window as any).matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
    }));
    activeStore.dispatch(applyBackendThemeConfig({ defaultLightTheme: 'Backend Theme' }));

    registerAppTheme({ name: 'Product Theme', base: 'light' }, { default: true });

    expect(activeStore.getState().theme.name).toBe('Product Theme');
    expect(localStorage.headlampThemePreference).toBe('Product Theme');
  });

  it('survives a backend default applied after plugin registration', () => {
    (window as any).matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
    }));
    registerAppTheme({ name: 'Product Theme', base: 'light' }, { default: true });

    activeStore.dispatch(applyBackendThemeConfig({ defaultLightTheme: 'Backend Theme' }));

    expect(activeStore.getState().theme.name).toBe('Product Theme');
    expect(localStorage.headlampThemePreference).toBe('Product Theme');
  });
});
