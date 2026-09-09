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
import reducers from '../redux/reducers/reducers';

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

import { setCurrentPluginName } from './pluginContext';
import {
  registerAppBarAction,
  registerClusterEmptyState,
  registerResourceRelationProvider,
  registerResourceTableColumnsProcessor,
  registerRoute,
  registerSidebarEntry,
} from './registry';

describe('registerResourceRelationProvider', () => {
  let warnSpy: any;

  beforeEach(() => {
    activeStore = configureStore({
      reducer: reducers,
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
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
});

describe('plugin attribution', () => {
  beforeEach(() => {
    activeStore = configureStore({
      reducer: reducers,
    });
  });

  afterEach(() => {
    setCurrentPluginName(null);
  });

  it('stamps registerSidebarEntry with the currently executing plugin', () => {
    setCurrentPluginName('my-plugin');

    registerSidebarEntry({ parent: null, name: 'traces', label: 'Traces', url: '/traces' });

    const entry = activeStore.getState().sidebar.entries['traces'];
    expect(entry).toBeDefined();
    expect(entry.plugin).toBe('my-plugin');
  });

  it('stamps registerSidebarEntry with null when no plugin is executing', () => {
    setCurrentPluginName(null);

    registerSidebarEntry({
      parent: null,
      name: 'no-plugin-entry',
      label: 'No Plugin',
      url: '/npe',
    });

    const entry = activeStore.getState().sidebar.entries['no-plugin-entry'];
    expect(entry.plugin).toBeNull();
  });

  it('does not let a registered entry spoof a different plugin name', () => {
    setCurrentPluginName('real-plugin');

    // Even if a plugin-supplied field happened to carry a "plugin" key, registerSidebarEntry
    // only forwards a fixed allowlist of fields to the store, so it can't be spoofed this way.
    registerSidebarEntry({
      parent: null,
      name: 'spoofed',
      label: 'Spoofed',
      url: '/spoofed',
      ...({ plugin: 'someone-elses-plugin' } as any),
    });

    const entry = activeStore.getState().sidebar.entries['spoofed'];
    expect(entry.plugin).toBe('real-plugin');
  });

  it('stamps registerRoute with the currently executing plugin and cannot be spoofed', () => {
    setCurrentPluginName('route-plugin');

    registerRoute({
      path: '/my-route',
      sidebar: null,
      component: () => null,
      ...({ plugin: 'spoofed-plugin' } as any),
    });

    const route = activeStore.getState().routes.routes['/my-route'];
    expect(route).toBeDefined();
    expect(route.plugin).toBe('route-plugin');
  });

  it('stamps registerAppBarAction with the currently executing plugin', () => {
    setCurrentPluginName('appbar-plugin');

    registerAppBarAction(() => null);

    const actions = activeStore.getState().actionButtons.appBarActions;
    expect(actions).toHaveLength(1);
    expect(actions[0].plugin).toBe('appbar-plugin');
  });

  it('stamps registerResourceTableColumnsProcessor with the currently executing plugin', () => {
    setCurrentPluginName('table-plugin');

    registerResourceTableColumnsProcessor(({ columns }) => columns);

    const processors = activeStore.getState().resourceTable.tableColumnsProcessors;
    expect(processors).toHaveLength(1);
    expect(processors[0].plugin).toBe('table-plugin');
  });
});
