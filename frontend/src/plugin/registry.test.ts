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
import reducers from '../redux/reducers/reducers';
import { setPluginSettings } from './pluginsSlice';

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

import Registry, {
  clusterAction,
  registerAddClusterProvider,
  registerAppBarAction,
  registerAppLogo,
  registerAppTheme,
  registerClusterChooser,
  registerClusterEmptyState,
  registerClusterProviderDeleteHandler,
  registerClusterProviderDialog,
  registerClusterProviderMenuItem,
  registerClusterStatus,
  registerCustomCreateProject,
  registerDetailsViewHeaderAction,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSection,
  registerDetailsViewSectionsProcessor,
  registerGetTokenFunction,
  registerHeadlampEventCallback,
  registerHomeSidebarEntryFilter,
  registerKindIcon,
  registerKubeObjectGlance,
  registerMapSource,
  registerOverviewChartsProcessor,
  registerPluginSettings,
  registerProjectApiResource,
  registerProjectDeleteButton,
  registerProjectDetailsTab,
  registerProjectGrouping,
  registerProjectHeaderAction,
  registerProjectOverviewSection,
  registerResourceRelationProvider,
  registerResourceTableColumnsProcessor,
  registerRoute,
  registerRouteFilter,
  registerSetTokenFunction,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerUIPanel,
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

  it('registers a cluster delete handler', () => {
    const handler = { owns: () => true, dialog: 'deleteMinikube' };

    registerClusterProviderDeleteHandler(handler);

    expect(activeStore.getState().clusterProvider.deleteHandlers).toEqual([handler]);
  });

  it.each(['', 'deleteDynamic'])('ignores a cluster delete handler with dialog %j', dialog => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerClusterProviderDeleteHandler({ owns: () => true, dialog });

    expect(activeStore.getState().clusterProvider.deleteHandlers).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring cluster delete handler')
    );
    errorSpy.mockRestore();
  });

  it.each([undefined, 'minikube'])('ignores a cluster delete handler with owns %j', owns => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerClusterProviderDeleteHandler({ owns, dialog: 'deleteMinikube' } as any);

    expect(activeStore.getState().clusterProvider.deleteHandlers).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring cluster delete handler')
    );
    errorSpy.mockRestore();
  });
});

describe('registerAppTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    activeStore = configureStore({ reducer: reducers });
  });

  afterEach(() => {
    localStorage.clear();
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

describe('registry dispatch wrappers', () => {
  beforeEach(() => {
    activeStore = configureStore({ reducer: reducers });
  });

  it('registerSidebarEntry dispatches setSidebarItem', () => {
    registerSidebarEntry({ name: 'my-entry', label: 'My Entry', url: '/my-entry', parent: null });
    expect(activeStore.getState().sidebar.entries['my-entry']).toBeDefined();
  });

  it('registerRoute dispatches setRoute', () => {
    const route = { path: '/test-route', component: () => null };
    registerRoute(route as any);
    expect(activeStore.getState().routes.routes['/test-route']).toBeDefined();
  });

  it('registerRouteFilter dispatches setRouteFilter', () => {
    const filter = vi.fn(r => r);
    registerRouteFilter(filter);
    expect(activeStore.getState().routes.routeFilters).toHaveLength(1);
  });

  it('registerSidebarEntryFilter dispatches setSidebarItemFilter', () => {
    const filter = vi.fn(e => e);
    registerSidebarEntryFilter(filter);
    expect(activeStore.getState().sidebar.filters).toHaveLength(1);
  });

  it('registerHomeSidebarEntryFilter dispatches setHomeSidebarItemFilter', () => {
    const filter = vi.fn(e => e);
    registerHomeSidebarEntryFilter(filter);
    expect(activeStore.getState().sidebar.homeFilters).toHaveLength(1);
  });

  it('registerDetailsViewHeaderAction dispatches setDetailsViewHeaderAction', () => {
    const action = vi.fn(() => null);
    registerDetailsViewHeaderAction(action);
    expect(activeStore.getState().actionButtons.headerActions).toHaveLength(1);
  });

  it('registerDetailsViewHeaderActionsProcessor dispatches addDetailsViewHeaderActionsProcessor', () => {
    const processor = vi.fn((_, actions) => actions);
    registerDetailsViewHeaderActionsProcessor(processor);
    expect(activeStore.getState().actionButtons.headerActionsProcessors).toHaveLength(1);
  });

  it('registerDetailsViewSection dispatches setDetailsViewSection', () => {
    const section = vi.fn(() => null);
    registerDetailsViewSection(section);
    expect(activeStore.getState().detailsViewSection.detailsViewSections).toHaveLength(1);
  });

  it('registerDetailsViewSectionsProcessor dispatches addDetailsViewSectionsProcessor', () => {
    const processor = vi.fn((_, sections) => sections);
    registerDetailsViewSectionsProcessor(processor);
    expect(activeStore.getState().detailsViewSection.detailsViewSectionsProcessors).toHaveLength(1);
  });

  it('registerResourceTableColumnsProcessor dispatches addResourceTableColumnsProcessor', () => {
    const processor = vi.fn(({ columns }) => columns);
    registerResourceTableColumnsProcessor(processor);
    expect(activeStore.getState().resourceTable.tableColumnsProcessors).toHaveLength(1);
  });

  it('registerAppBarAction dispatches setAppBarAction and processor when applicable', () => {
    const action = vi.fn(() => null);
    registerAppBarAction(action);
    expect(activeStore.getState().actionButtons.appBarActions).toHaveLength(1);
    expect(activeStore.getState().actionButtons.appBarActionsProcessors).toHaveLength(0);

    const processor = { id: 'my-proc', processor: ({ actions }: any) => actions };
    registerAppBarAction(processor);
    expect(activeStore.getState().actionButtons.appBarActionsProcessors).toHaveLength(1);
  });

  it('registerAppLogo dispatches setBrandingAppLogoComponent', () => {
    const logo = vi.fn(() => null);
    registerAppLogo(logo);
    expect(activeStore.getState().theme.logo).toBe(logo);
  });

  it('registerClusterChooser dispatches setClusterChooserButton', () => {
    const chooser = vi.fn(() => null);
    registerClusterChooser(chooser);
    expect(activeStore.getState().ui.clusterChooserButtonComponent).toBe(chooser);
  });

  it('registerSetTokenFunction stores the override', () => {
    const override = vi.fn();
    registerSetTokenFunction(override);
    expect(activeStore.getState().ui.functionsToOverride.setToken).toBe(override);
  });

  it('registerGetTokenFunction stores the override', () => {
    const override = vi.fn();
    registerGetTokenFunction(override);
    expect(activeStore.getState().ui.functionsToOverride.getToken).toBe(override);
  });

  it('registerHeadlampEventCallback dispatches addEventCallback', () => {
    const cb = vi.fn();
    registerHeadlampEventCallback(cb);
    expect(activeStore.getState().eventCallbackReducer.trackerFuncs).toHaveLength(1);
  });

  it('registerPluginSettings dispatches setPluginSettingsComponent', () => {
    activeStore.dispatch(setPluginSettings([{ name: 'my-plugin', description: '', homepage: '' }]));
    const component = vi.fn(() => null);
    registerPluginSettings('my-plugin', component, true);
    const updated = activeStore
      .getState()
      .plugins.pluginSettings.find((p: any) => p.name === 'my-plugin');
    expect(updated?.settingsComponent).toBe(component);
    expect(updated?.displaySettingsComponentWithSaveButton).toBe(true);
  });

  it('registerOverviewChartsProcessor dispatches addOverviewChartsProcessor', () => {
    const processor = { id: 'test-charts-proc', processor: vi.fn(charts => charts) };
    registerOverviewChartsProcessor(processor);
    expect(activeStore.getState().overviewCharts.processors).toHaveLength(1);
  });

  it('registerKubeObjectGlance dispatches setGlance', () => {
    const glance = { id: 'test-glance', component: vi.fn(() => null) };
    registerKubeObjectGlance(glance as any);
    expect(activeStore.getState().graphView.glances['test-glance']).toBeDefined();
  });

  it('registerKindIcon dispatches addKindIcon', () => {
    const icon = { icon: null, color: '#ff0000' };
    registerKindIcon('MyKind', icon as any);
    expect(activeStore.getState().graphView.kindIcons['MyKind']).toBeDefined();
  });

  it('registerKindIcon with apiGroup dispatches addKindIcon with apiGroup key', () => {
    const icon = { icon: null };
    registerKindIcon('Service', icon as any, 'networking.k8s.io');
    expect(activeStore.getState().graphView.kindIcons['networking.k8s.io/Service']).toBeDefined();
  });

  it('registerMapSource dispatches addGraphSource', () => {
    const source = {
      id: 'my-source',
      label: 'My Source',
      useData: vi.fn(() => ({ nodes: [], edges: [] })),
    };
    registerMapSource(source as any);
    const sources = activeStore.getState().graphView.graphSources;
    expect(sources.some((s: any) => s.id === 'my-source')).toBe(true);
  });

  it('registerClusterProviderMenuItem dispatches addMenuItem', () => {
    const item = vi.fn(() => null);
    registerClusterProviderMenuItem(item);
    expect(activeStore.getState().clusterProvider.menuItems).toHaveLength(1);
  });

  it('registerClusterStatus dispatches addClusterStatus', () => {
    const statusComp = vi.fn(() => null);
    registerClusterStatus(statusComp);
    expect(activeStore.getState().clusterProvider.clusterStatuses).toHaveLength(1);
  });

  it('registerClusterProviderDialog dispatches addDialog', () => {
    const dialog = vi.fn(() => null);
    registerClusterProviderDialog(dialog);
    expect(activeStore.getState().clusterProvider.dialogs).toHaveLength(1);
  });

  it('registerAddClusterProvider dispatches addAddClusterProvider', () => {
    const provider = {
      title: 'Minikube',
      description: 'desc',
      url: '/create-minikube',
      icon: null,
    };
    registerAddClusterProvider(provider as any);
    expect(activeStore.getState().clusterProvider.clusterProviders).toHaveLength(1);
  });

  it('registerUIPanel dispatches addUIPanel', () => {
    const panel = { id: 'my-panel', side: 'right', component: vi.fn(() => null) };
    registerUIPanel(panel as any);
    expect(activeStore.getState().ui.panels.some((p: any) => p.id === 'my-panel')).toBe(true);
  });

  it('registerCustomCreateProject dispatches addCustomCreateProject', () => {
    const proj = { id: 'my-project', name: 'My Project', description: 'desc', component: vi.fn() };
    registerCustomCreateProject(proj as any);
    expect(activeStore.getState().projects.customCreateProject['my-project']).toBeDefined();
  });

  it('registerProjectGrouping dispatches setProjectGrouping', () => {
    const grouping = { getProjectKey: vi.fn(({ projectId }) => projectId) };
    registerProjectGrouping(grouping as any);
    expect(activeStore.getState().projects.projectGrouping).toBe(grouping);
  });

  it('registerProjectDetailsTab dispatches addDetailsTab', () => {
    const tab = { id: 'my-tab', label: 'My Tab', component: vi.fn(() => null) };
    registerProjectDetailsTab(tab as any);
    expect(activeStore.getState().projects.detailsTabs['my-tab']).toBeDefined();
  });

  it('registerProjectOverviewSection dispatches addOverviewSection', () => {
    const section = { id: 'my-section', component: vi.fn(() => null) };
    registerProjectOverviewSection(section as any);
    expect(activeStore.getState().projects.overviewSections['my-section']).toBeDefined();
  });

  it('registerProjectDeleteButton dispatches setProjectDeleteButton', () => {
    const btn = { component: vi.fn(() => null) };
    registerProjectDeleteButton(btn as any);
    expect(activeStore.getState().projects.projectDeleteButton).toBe(btn);
  });

  it('registerProjectHeaderAction dispatches addHeaderAction', () => {
    const action = { id: 'my-action', component: vi.fn(() => null) };
    registerProjectHeaderAction(action as any);
    expect(activeStore.getState().projects.headerActions['my-action']).toBeDefined();
  });

  it('registerProjectApiResource dispatches addProjectApiResource for namespaced resources', () => {
    const resource = {
      apiVersion: 'argoproj.io/v1alpha1',
      version: 'v1alpha1',
      pluralName: 'applications',
      singularName: 'application',
      kind: 'Application',
      isNamespaced: true,
    };
    registerProjectApiResource(resource as any);
    expect(activeStore.getState().projects.apiResources).toHaveLength(1);
  });

  it('registerProjectApiResource warns and skips non-namespaced resources', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resource = {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'nodes',
      singularName: 'node',
      kind: 'Node',
      isNamespaced: false,
    };
    registerProjectApiResource(resource as any);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-namespaced resource'));
    expect(activeStore.getState().projects.apiResources).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('registerProjectApiResource normalizes groupName from apiVersion', () => {
    const resource = {
      apiVersion: 'argoproj.io/v1alpha1',
      version: 'v1alpha1',
      pluralName: 'rollouts',
      singularName: 'rollout',
      kind: 'Rollout',
      isNamespaced: true,
      // groupName intentionally omitted
    };
    registerProjectApiResource(resource as any);
    const added = activeStore.getState().projects.apiResources[0];
    expect(added.groupName).toBe('argoproj.io');
  });

  it('clusterAction dispatches sendClusterAction and invokes callback after grace period', async () => {
    vi.useFakeTimers();
    try {
      const cb = vi.fn(() => Promise.resolve());
      clusterAction(cb, { startMessage: 'Starting…', successMessage: 'Done.' });

      expect(cb).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      expect(cb).toHaveBeenCalledTimes(1);

      // Flush the 3000ms post-action cleanup timer
      await vi.advanceTimersByTimeAsync(3000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('deprecated Registry class methods', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    activeStore = configureStore({ reducer: reducers });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('forwards deprecated Registry methods to the store with deprecation warnings', () => {
    const registry = new Registry();

    registry.registerSidebarItem(null, 'legacy-entry', 'Legacy', '/legacy');
    expect(activeStore.getState().sidebar.entries['legacy-entry']).toBeDefined();

    registry.registerRoute({ path: '/legacy-route', component: () => null } as any);
    expect(activeStore.getState().routes.routes['/legacy-route']).toBeDefined();

    registry.registerDetailsViewHeaderAction('legacy-action', () => null);
    expect(activeStore.getState().actionButtons.headerActions).toHaveLength(1);

    registry.registerAppBarAction('legacy-appbar', () => null);
    expect(activeStore.getState().actionButtons.appBarActions).toHaveLength(1);

    registry.registerDetailsViewSection('legacy-section', () => null);
    expect(activeStore.getState().detailsViewSection.detailsViewSections).toHaveLength(1);

    const logo = vi.fn(() => null);
    registry.registerAppLogo(logo);
    expect(activeStore.getState().theme.logo).toBe(logo);

    const chooser = vi.fn(() => null);
    registry.registerClusterChooserComponent(chooser);
    expect(activeStore.getState().ui.clusterChooserButtonComponent).toBe(chooser);

    expect(warnSpy).toHaveBeenCalledTimes(7);
  });
});
