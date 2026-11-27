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

import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import { createMuiTheme } from '../../lib/themes';
import { registerCustomViewWidget } from '../../plugin/registry';
import customViewsReducer, {
  addWidgetToView,
  createView,
  deleteView,
  duplicateView,
  moveWidgetInView,
  registerWidgetDefinition,
  unregisterWidgetDefinition,
  updateWidgetInView,
} from '../../redux/customViewsSlice';
import reducers from '../../redux/reducers/reducers';
import store from '../../redux/stores/store';
import { lightTheme } from '../App/defaultAppThemes';
import { AddToViewButton } from './AddToViewButton';
import { BUILTIN_WIDGET_TYPES } from './builtinWidgets';
import { CUSTOM_VIEWS_STORAGE_KEY, parseImportedCustomView, readCustomViews } from './storage';
import ViewDetails from './ViewDetails';
import ViewsList from './ViewsList';

function createTestStore() {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      customViews: {
        views: readCustomViews(),
        widgetDefinitions: [],
      },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  {
    testStore = createTestStore(),
    initialEntries = ['/c/default/views'],
    routePath,
  }: {
    testStore?: ReturnType<typeof createTestStore>;
    initialEntries?: string[];
    routePath?: string;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrap = (node: React.ReactElement) => (
    <Provider store={testStore}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <QueryClientProvider client={queryClient}>
          <SnackbarProvider>
            <MemoryRouter initialEntries={initialEntries}>
              {routePath ? <Route path={routePath}>{node}</Route> : node}
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </Provider>
  );

  const rendered = render(wrap(ui));
  return {
    store: testStore,
    ...rendered,
    rerenderWithProviders: (nextUi: React.ReactElement) => rendered.rerender(wrap(nextUi)),
  };
}

describe('customViews storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and normalizes views while discarding malformed entries', () => {
    localStorage.setItem(
      CUSTOM_VIEWS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'view-1',
          name: '  Production Ops  ',
          widgets: [
            {
              id: 'w-1',
              type: 'headlamp.resource-details',
              title: 'API Pod',
              colSpan: 99,
              config: {},
            },
            { id: 'bad-widget', type: '' },
          ],
        },
        { id: 'bad-view', name: '   ' },
      ])
    );

    const views = readCustomViews();
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe('Production Ops');
    expect(views[0].widgets).toHaveLength(1);
    expect(views[0].widgets[0].colSpan).toBe(6);
  });

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem(CUSTOM_VIEWS_STORAGE_KEY, '{not-json');
    expect(readCustomViews()).toEqual([]);
  });

  it('parses imported view JSON and regenerates unique IDs', () => {
    const imported = parseImportedCustomView(
      JSON.stringify({
        id: 'old-id',
        name: 'Flux Releases',
        widgets: [{ id: 'old-w', type: 'headlamp.resource-events', title: 'Events', config: {} }],
      })
    );

    expect(imported).not.toBeNull();
    expect(imported?.name).toBe('Flux Releases');
    expect(imported?.id).not.toBe('old-id');
    expect(imported?.widgets[0].id).not.toBe('old-w');
  });
});

describe('customViewsSlice & plugin widget registration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    store.dispatch(unregisterWidgetDefinition('prometheus.chart'));
  });

  it('creates, updates, reorders, duplicates, and deletes views in localStorage', () => {
    let state = customViewsReducer(undefined, createView({ id: 'v1', name: 'Main Dashboard' }));
    expect(state.views).toHaveLength(1);

    state = customViewsReducer(
      state,
      addWidgetToView({
        viewId: 'v1',
        widget: { id: 'w1', type: 'headlamp.resource-details', title: 'First', config: {} },
      })
    );
    state = customViewsReducer(
      state,
      addWidgetToView({
        viewId: 'v1',
        widget: { id: 'w2', type: 'headlamp.resource-events', title: 'Second', config: {} },
      })
    );
    state = customViewsReducer(
      state,
      moveWidgetInView({ viewId: 'v1', widgetId: 'w2', direction: 'left' })
    );
    expect(state.views[0].widgets.map(w => w.id)).toEqual(['w2', 'w1']);

    state = customViewsReducer(
      state,
      updateWidgetInView({ viewId: 'v1', widgetId: 'w2', colSpan: 12, title: 'Updated Second' })
    );
    expect(state.views[0].widgets[0].colSpan).toBe(12);
    expect(state.views[0].widgets[0].title).toBe('Updated Second');

    state = customViewsReducer(state, duplicateView({ id: 'v1' }));
    expect(state.views).toHaveLength(2);
    expect(state.views[0].name).toBe('Main Dashboard (Copy)');

    state = customViewsReducer(state, deleteView('v1'));
    expect(state.views).toHaveLength(1);
    expect(readCustomViews()).toHaveLength(1);
  });

  it('registers plugin widgets cleanly via registerCustomViewWidget', () => {
    registerCustomViewWidget({
      type: 'prometheus.chart',
      label: 'Prometheus Chart',
      component: ({ config }) => <div>PromQL: {config.query}</div>,
    });

    const registered = store
      .getState()
      .customViews.widgetDefinitions.find(w => w.type === 'prometheus.chart');
    expect(registered).toBeDefined();
    expect(registered?.label).toBe('Prometheus Chart');
  });
});

describe('ViewsList component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows creating, filtering, duplicating, importing, and deleting views', async () => {
    renderWithProviders(<ViewsList />);

    expect(screen.getByText('No custom views yet')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Create View' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/View Name/i), {
      target: { value: 'Workload Health' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Description/i), {
      target: { value: 'Pods and metrics' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Workload Health')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Filter views'), {
      target: { value: 'nomatch' },
    });
    expect(screen.getByText('No views match your filter')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filter views'), {
      target: { value: 'Workload' },
    });
    expect(screen.getByText('Workload Health')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate view' }));
    expect(screen.getByText('Workload Health (Copy)')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete view' })[0]);
    const deleteDialog = screen.getByRole('dialog');
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Workload Health (Copy)')).not.toBeInTheDocument();
  });
});

describe('ViewDetails component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders plugin-registered widgets, handles missing plugin types, and supports fullscreen & controls', async () => {
    const testStore = createTestStore();
    testStore.dispatch(
      registerWidgetDefinition({
        type: 'prometheus.cpu-graph',
        label: 'Prometheus CPU',
        description: 'Custom PromQL chart from Prometheus plugin',
        icon: 'mdi:chart-timeline-variant',
        component: ({ config }) => <div>Prom Chart for {config.query || 'default'}</div>,
        configComponent: ({ config, onChange }) => (
          <input
            aria-label="PromQL Query"
            value={config.query ?? ''}
            onChange={e => onChange({ ...config, query: e.target.value })}
          />
        ),
      })
    );

    testStore.dispatch(
      createView({
        id: 'view-prom',
        name: 'Checkout Overview',
        description: 'Combined resources and Prometheus charts',
      })
    );
    testStore.dispatch(
      addWidgetToView({
        viewId: 'view-prom',
        widget: {
          id: 'missing-w',
          type: 'uninstalled.plugin.widget',
          title: 'Missing Plugin Widget',
          config: {},
        },
      })
    );

    renderWithProviders(<ViewDetails />, {
      testStore,
      initialEntries: ['/c/default/views/view-prom'],
      routePath: '/c/:cluster/views/:id',
    });

    expect(screen.getByText('Checkout Overview')).toBeInTheDocument();
    expect(
      screen.getByText(/Widget type "uninstalled\.plugin\.widget" is unavailable/)
    ).toBeInTheDocument();

    // Add plugin-registered widget through "+ Add Widget" dialog
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(within(dialog).getByLabelText('Widget Type'));
    fireEvent.click(screen.getByRole('option', { name: 'Prometheus CPU' }));
    fireEvent.change(within(dialog).getByLabelText('PromQL Query'), {
      target: { value: 'rate(container_cpu_usage_seconds_total[5m])' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(
      screen.getByText('Prom Chart for rate(container_cpu_usage_seconds_total[5m])')
    ).toBeInTheDocument();

    // Toggle fullscreen mode
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument();

    // Remove the missing widget
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove widget' })[0]);
    expect(
      screen.queryByText(/Widget type "uninstalled\.plugin\.widget" is unavailable/)
    ).not.toBeInTheDocument();
  });
});

describe('AddToViewButton component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a Pod (and plugin widgets) to a new or existing view', async () => {
    const testStore = createTestStore();
    testStore.dispatch(
      registerWidgetDefinition({
        type: 'prometheus.pod-metrics',
        label: 'Prometheus Pod Metrics',
        component: () => <div>Prom Metrics</div>,
        supportsResource: resource => resource.kind === 'Pod',
        createConfigFromResource: ({ resource, cluster }) => ({
          title: `Prom: ${resource.getName()}`,
          config: { pod: resource.getName(), namespace: resource.getNamespace(), cluster },
        }),
      })
    );

    const pod = new Pod(
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'web-0', namespace: 'prod', uid: 'pod-1' },
        spec: { containers: [{ name: 'app', image: 'nginx' }] },
      } as any,
      'prod-cluster'
    );

    const { rerenderWithProviders } = renderWithProviders(<AddToViewButton item={pod} />, {
      testStore,
      initialEntries: ['/c/prod-cluster/pods/prod/web-0'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add to View' }));
    const dialog = screen.getByRole('dialog');

    // Should offer built-in Summary, Logs, Events, and the matching Prometheus Pod widget.
    fireEvent.mouseDown(within(dialog).getByLabelText('Widget Type'));
    expect(screen.getByRole('option', { name: 'Resource Summary' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Resource Logs' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Prometheus Pod Metrics' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Resource Logs' }));
    fireEvent.change(within(dialog).getByLabelText(/New View Name/i), {
      target: { value: 'Prod Debugging' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const views = testStore.getState().customViews.views;
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe('Prod Debugging');
    expect(views[0].widgets[0].type).toBe(BUILTIN_WIDGET_TYPES.RESOURCE_LOGS);
    expect(views[0].widgets[0].config).toMatchObject({
      kind: 'Pod',
      name: 'web-0',
      namespace: 'prod',
      cluster: 'prod-cluster',
    });

    // Add a ReplicaSet summary into the newly created existing view
    const replicaSet = new ReplicaSet(
      {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: { name: 'web-rs', namespace: 'prod', uid: 'rs-1' },
      } as any,
      'prod-cluster'
    );

    rerenderWithProviders(<AddToViewButton item={replicaSet} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to View' }));
    const rsDialog = screen.getByRole('dialog');
    fireEvent.click(within(rsDialog).getByRole('button', { name: 'Add' }));

    const updatedViews = testStore.getState().customViews.views;
    expect(updatedViews[0].widgets).toHaveLength(2);
    expect(updatedViews[0].widgets[1].config).toMatchObject({
      kind: 'ReplicaSet',
      name: 'web-rs',
      namespace: 'prod',
    });
  });

  it('adds Overview metrics preset directly to a view', async () => {
    const testStore = createTestStore();
    testStore.dispatch(createView({ id: 'ops-view', name: 'Ops View' }));

    renderWithProviders(
      <AddToViewButton
        preset={{
          type: BUILTIN_WIDGET_TYPES.CLUSTER_METRICS,
          title: 'Cluster Metrics',
          colSpan: 6,
          config: { metric: 'all' },
        }}
      />,
      { testStore }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to View' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const views = testStore.getState().customViews.views;
    expect(views[0].widgets).toHaveLength(1);
    expect(views[0].widgets[0].type).toBe(BUILTIN_WIDGET_TYPES.CLUSTER_METRICS);
  });
});
