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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Base64 } from 'js-base64';
import { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { QueryResponse } from '../../../lib/k8s/api/v2/hooks';
import { KubeContainer } from '../../../lib/k8s/cluster';
import ConfigMap from '../../../lib/k8s/configMap';
import Event from '../../../lib/k8s/event';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubePod } from '../../../lib/k8s/pod';
import Secret from '../../../lib/k8s/secret';
import { createMuiTheme } from '../../../lib/themes';
import reducers from '../../../redux/reducers/reducers';
import { TestContext } from '../../../test';
import {
  DetailsGridContext,
  DetailsViewSectionState,
} from '../../DetailsViewSection/detailsViewSectionSlice';
import {
  buildEnvironmentVariables,
  DataField,
  DetailsGrid,
  extractEnvVarReferences,
  SecretField,
  SectionGrid,
  VolumeMounts,
} from './Resource';

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    language,
    height,
    onChange,
  }: {
    value?: string;
    language?: string;
    height?: string;
    onChange: (value: string | undefined) => void;
  }) => (
    <>
      <textarea
        aria-label="Configuration editor"
        data-language={language}
        style={{ height }}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      <button onClick={() => onChange(undefined)}>Editor loading</button>
    </>
  ),
}));

const metadata = {
  name: 'workload',
  namespace: 'default',
  uid: 'uid-1',
  creationTimestamp: '2025-01-01T00:00:00Z',
};
const container: KubeContainer = {
  name: 'app',
  image: 'nginx',
  imagePullPolicy: 'IfNotPresent',
  resources: { requests: { cpu: '250m', memory: '128Mi' } },
};
const pod: KubePod = {
  kind: 'Pod',
  metadata,
  spec: { containers: [container], nodeName: 'node-1' },
  status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '' },
};
type References = Parameters<typeof buildEnvironmentVariables>[0];
type FetchedResources = Parameters<typeof buildEnvironmentVariables>[1];

function ThemedContext({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={createMuiTheme({ base: 'light', name: 'light' })}>
      {children}
    </ThemeProvider>
  );
}

function build(
  references: References,
  secrets: FetchedResources = new Map(),
  configMaps: FetchedResources = new Map(),
  resource: KubePod = pod,
  started: string | undefined = '2025-01-02T00:00:00Z'
) {
  return buildEnvironmentVariables(references, secrets, configMaps, resource, container, started);
}

describe('environment variable resolution', () => {
  it('extracts literal, downward API and bulk references, preserving optional flags and prefixes', () => {
    const references = extractEnvVarReferences({
      ...container,
      env: [
        { name: 'MODE', value: 'production' },
        {
          name: 'NAME',
          valueFrom: { fieldRef: { apiVersion: 'v1', fieldPath: 'metadata.name' } },
        },
        {
          name: 'CPU',
          valueFrom: {
            resourceFieldRef: { resource: 'requests.cpu', containerName: 'app', divisor: '1m' },
          },
        },
        {
          name: 'SETTING',
          valueFrom: { configMapKeyRef: { name: 'settings', key: 'mode', optional: true } },
        },
        { name: 'EMPTY' },
      ],
      envFrom: [
        { secretRef: { name: 'credentials', optional: true }, prefix: 'SECRET_' },
        { configMapRef: { name: 'settings', optional: false }, prefix: 'CONFIG_' },
      ],
    });
    expect(references).toEqual([
      { name: 'MODE', type: 'value', value: 'production' },
      { name: 'NAME', type: 'field', fieldPath: 'metadata.name' },
      {
        name: 'CPU',
        type: 'resourceField',
        resource: 'requests.cpu',
        containerName: 'app',
        divisor: '1m',
      },
      {
        name: 'SETTING',
        type: 'configMap',
        resourceName: 'settings',
        key: 'mode',
        optional: true,
      },
      {
        name: 'credentials',
        type: 'secretRef',
        resourceName: 'credentials',
        optional: true,
        prefix: 'SECRET_',
      },
      {
        name: 'settings',
        type: 'configMapRef',
        resourceName: 'settings',
        optional: false,
        prefix: 'CONFIG_',
      },
    ]);
  });

  it('waits for unresolved references and omits optional missing resources without hiding forbidden errors', () => {
    const notFound = new ApiError('not found', { status: 404 });
    const forbidden = new ApiError('forbidden', { status: 403 });
    const references: References = [
      { name: 'loading', type: 'secret', resourceName: 'loading', key: 'key' },
      { name: 'loading-map', type: 'configMap', resourceName: 'loading', key: 'key' },
      { name: 'missing-secret', type: 'secret', resourceName: 'missing', optional: true },
      { name: 'missing-map', type: 'configMap', resourceName: 'missing', optional: true },
      { name: 'missing-secrets', type: 'secretRef', resourceName: 'missing', optional: true },
      { name: 'missing-maps', type: 'configMapRef', resourceName: 'missing', optional: true },
      { name: 'TOKEN', type: 'secret', resourceName: 'denied', optional: true },
      { name: 'CONFIG', type: 'configMap', resourceName: 'denied' },
      { name: 'secrets', type: 'secretRef', resourceName: 'denied', prefix: 'SECRET_' },
      { name: 'maps', type: 'configMapRef', resourceName: 'denied', prefix: 'CONFIG_' },
    ];
    const fetched: FetchedResources = new Map([
      ['missing', { resource: null, error: notFound }],
      ['denied', { resource: null, error: forbidden }],
    ]);
    expect(build(references, fetched, fetched)).toEqual(
      ['CONFIG', 'CONFIG_denied', 'SECRET_denied', 'TOKEN']
        .sort((a, b) => a.localeCompare(b))
        .map(key => ({
          key,
          from: null,
          value: 'forbidden',
          isError: true,
          isSecret: false,
          isOutOfSync: false,
        }))
    );
  });

  it('expands config maps, applies prefixes and lets later explicit values override bulk values', () => {
    const configMap = new ConfigMap({
      kind: 'ConfigMap',
      metadata: { ...metadata, creationTimestamp: '2025-01-03T00:00:00Z' },
      data: { MODE: 'stale', REGION: 'east' },
    });
    const fetched: FetchedResources = new Map([['settings', { resource: configMap, error: null }]]);
    expect(
      build(
        [
          { name: 'settings', type: 'configMapRef', resourceName: 'settings', prefix: 'APP_' },
          { name: 'APP_MODE', type: 'value', value: 'production' },
          { name: 'MISSING', type: 'configMap', resourceName: 'settings', key: 'absent' },
        ],
        new Map(),
        fetched
      )
    ).toEqual([
      {
        key: 'APP_MODE',
        value: 'production',
        from: 'manifest',
        isSecret: false,
        isError: false,
        isOutOfSync: false,
      },
      {
        key: 'APP_REGION',
        value: 'east',
        from: configMap,
        isSecret: false,
        isError: false,
        isOutOfSync: true,
      },
      {
        key: 'MISSING',
        value: '',
        from: configMap,
        isSecret: false,
        isError: false,
        isOutOfSync: true,
      },
    ]);
  });

  it('handles empty secret keys and config maps without data without inventing entries', () => {
    const secret = new Secret({ kind: 'Secret', metadata, data: { EMPTY: '' }, type: 'Opaque' });
    const configMap = new ConfigMap({ kind: 'ConfigMap', metadata });
    const variables = build(
      [
        { name: 'EMPTY', type: 'secret', resourceName: 'secret', key: 'missing' },
        { name: 'secret', type: 'secretRef', resourceName: 'secret' },
        { name: 'config', type: 'configMapRef', resourceName: 'config' },
        { name: 'SETTING', type: 'configMap', resourceName: 'config', key: 'missing' },
      ],
      new Map([['secret', { resource: secret, error: null }]]),
      new Map([['config', { resource: configMap, error: null }]])
    );
    expect(
      variables.map(({ key, value, isSecret, isOutOfSync }) => ({
        key,
        value,
        isSecret,
        isOutOfSync,
      }))
    ).toEqual([
      { key: 'EMPTY', value: '', isSecret: true, isOutOfSync: false },
      { key: 'SETTING', value: '', isSecret: false, isOutOfSync: false },
    ]);
  });

  it('resolves downward API strings, structured fields and absent fields', () => {
    const variables = build([
      { name: 'NAME', type: 'field', fieldPath: 'metadata.name' },
      { name: 'LABELS', type: 'field', fieldPath: 'metadata' },
      { name: 'MISSING', type: 'field', fieldPath: 'metadata.labels.absent' },
    ]);
    expect(
      variables.map(({ key, value, from, isError }) => ({ key, value, from, isError }))
    ).toEqual([
      {
        key: 'LABELS',
        value: JSON.stringify(metadata),
        from: 'fieldRef: metadata',
        isError: false,
      },
      { key: 'MISSING', value: '', from: 'fieldRef: metadata.labels.absent', isError: false },
      { key: 'NAME', value: 'workload', from: 'fieldRef: metadata.name', isError: false },
    ]);
  });

  it('divides resource quantities, rounds upward and treats a zero divisor as one', () => {
    const variables = build([
      { name: 'CPU', type: 'resourceField', resource: 'requests.cpu', divisor: '100m' },
      { name: 'MEMORY', type: 'resourceField', resource: 'requests.memory', divisor: '1Mi' },
      { name: 'ZERO', type: 'resourceField', resource: 'requests.cpu', divisor: '0' },
    ]);
    expect(variables.map(({ key, value, isError }) => ({ key, value, isError }))).toEqual([
      { key: 'CPU', value: '3', isError: false },
      { key: 'MEMORY', value: '128', isError: false },
      { key: 'ZERO', value: '1', isError: false },
    ]);
    expect(variables[2].from).toBe('resourceFieldRef: app.requests.cpu / 1');
  });

  it('finds resource requests in init, ephemeral and workload template containers', () => {
    const init = { ...container, name: 'init' };
    const ephemeral = { ...container, name: 'debug' };
    const template = { ...container, name: 'template' };
    const job = { ...container, name: 'job' };
    const spec = {
      ...pod.spec,
      initContainers: [init],
      ephemeralContainers: [ephemeral],
      template: { spec: { containers: [template] } },
      jobTemplate: { spec: { template: { spec: { containers: [job] } } } },
    };
    const variables = build(
      ['init', 'debug', 'template', 'job'].map(name => ({
        name,
        type: 'resourceField',
        resource: 'requests.cpu',
        containerName: name,
      })),
      new Map(),
      new Map(),
      { ...pod, spec }
    );
    expect(variables).toHaveLength(4);
    for (const variable of variables) {
      expect(variable.value).toBe('1');
      expect(variable.isError).toBe(false);
      expect(variable.from).toBe(`resourceFieldRef: ${variable.key}.requests.cpu / 1`);
    }
  });

  it('reports missing containers and missing requested resources rather than displaying zero', () => {
    const variables = build([
      { name: 'CONTAINER', type: 'resourceField', resource: 'requests.cpu', containerName: 'gone' },
      { name: 'RESOURCE', type: 'resourceField', resource: 'limits.cpu' },
    ]);
    expect(variables.map(({ key, value, isError }) => ({ key, value, isError }))).toEqual([
      { key: 'CONTAINER', value: 'Container gone not found', isError: true },
      { key: 'RESOURCE', value: 'Resource limits.cpu not found for container app', isError: true },
    ]);
  });
});

describe('DataField', () => {
  it('updates and saves JSON text, ignoring undefined editor loading events', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(
      <TestContext>
        <DataField label="settings.json" value="{}" onChange={onChange} onSave={onSave} />
      </TestContext>
    );
    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('data-language', 'json');
    expect(editor).toHaveStyle({ height: '3vh' });
    fireEvent.click(screen.getByRole('button', { name: 'Editor loading' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: '{\n  "enabled": true\n}' } });
    expect(editor).toHaveStyle({ height: '10vh' });
    expect(onChange).toHaveBeenLastCalledWith('{\n  "enabled": true\n}');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('{\n  "enabled": true\n}');
  });

  it('expands long YAML documents and supports hiding the label and save action', () => {
    render(
      <TestContext>
        <DataField label="settings.conf" disableLabel value={'line\n'.repeat(12)} />
      </TestContext>
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('data-language', 'yaml');
    expect(screen.getByRole('textbox')).toHaveStyle({ height: '40vh' });
    expect(screen.queryByText('settings.conf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('DetailsGrid', () => {
  function resourceResponse(
    resource: ConfigMap | null,
    error: ApiError | null = null
  ): [ConfigMap | null, ApiError | null] & QueryResponse<ConfigMap, ApiError> {
    const tuple: [ConfigMap | null, ApiError | null] = [resource, error];
    const response: QueryResponse<ConfigMap, ApiError> = {
      data: resource,
      error,
      isError: error !== null,
      isLoading: resource === null && error === null,
      isFetching: resource === null && error === null,
      isSuccess: resource !== null && error === null,
      status: error ? 'error' : resource ? 'success' : 'pending',
    };
    return Object.assign(tuple, response);
  }

  function makeResource(version = '1') {
    return new ConfigMap(
      { kind: 'ConfigMap', metadata: { ...metadata, resourceVersion: version } },
      'test-cluster'
    );
  }

  function makeStore(details: Partial<DetailsViewSectionState> = {}) {
    return configureStore({
      reducer: reducers,
      preloadedState: {
        detailsViewSection: {
          detailViews: [],
          detailsViewSections: [],
          detailsViewSectionsProcessors: [],
          ...details,
        },
      },
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
  }

  function LocationProbe() {
    return <output aria-label="Current path">{useLocation().pathname}</output>;
  }

  afterEach(() => vi.restoreAllMocks());

  it('updates the caller once per resource version or error, not once per wrapper instance', () => {
    const get = vi.spyOn(ConfigMap, 'useGet').mockReturnValue(resourceResponse(makeResource()));
    const onResourceUpdate = vi.fn();
    const store = makeStore();
    const content = () => (
      <TestContext store={store}>
        <ThemedContext>
          <DetailsGrid
            resourceType={ConfigMap}
            name="workload"
            namespace="default"
            cluster="test-cluster"
            onResourceUpdate={onResourceUpdate}
            noDefaultActions
          />
        </ThemedContext>
      </TestContext>
    );
    const view = render(content());
    expect(onResourceUpdate).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('workload', 'default', { cluster: 'test-cluster' });

    get.mockReturnValue(resourceResponse(makeResource()));
    view.rerender(content());
    expect(onResourceUpdate).toHaveBeenCalledTimes(1);

    const updated = makeResource('2');
    get.mockReturnValue(resourceResponse(updated));
    view.rerender(content());
    expect(onResourceUpdate).toHaveBeenCalledTimes(2);
    expect(onResourceUpdate).toHaveBeenLastCalledWith(updated, null);

    const error = new ApiError('watch unavailable');
    get.mockReturnValue(resourceResponse(updated, error));
    view.rerender(content());
    expect(onResourceUpdate).toHaveBeenCalledTimes(3);
    expect(onResourceUpdate).toHaveBeenLastCalledWith(updated, error);
  });

  it('keeps processing sections after a plugin throws and renders component, node and empty sections', async () => {
    const resource = makeResource();
    vi.spyOn(ConfigMap, 'useGet').mockReturnValue(resourceResponse(resource));
    vi.spyOn(Event, 'objectEvents').mockResolvedValue([]);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const extraSections = vi.fn(() => [{ id: 'extra', section: <div>Extra details</div> }]);
    const store = makeStore({
      detailsViewSections: [{ id: 'plugin', section: <div>Plugin section</div> }],
      detailsViewSectionsProcessors: [
        {
          id: 'broken',
          processor: () => {
            throw new Error('plugin failed');
          },
        },
        {
          id: 'custom',
          processor: (_item, sections) => [
            ...sections,
            {
              id: 'component',
              section: ({ resource }: { resource: KubeObject }) => (
                <div>Component for {resource.getName()}</div>
              ),
            },
            { id: 'empty', section: null },
            'Plain section',
          ],
        },
      ],
    });
    render(
      <TestContext store={store}>
        <ThemedContext>
          <DetailsGrid
            resourceType={ConfigMap}
            name="workload"
            noDefaultActions
            withEvents
            sectionsFunc={() => <div>Legacy details</div>}
            extraSections={extraSections}
            headerSection={item => <div>Header for {item?.getName()}</div>}
          >
            <div>Child section</div>
          </DetailsGrid>
        </ThemedContext>
      </TestContext>
    );
    for (const text of [
      'Extra details',
      'Plugin section',
      'Component for workload',
      'Plain section',
      'Legacy details',
      'Header for workload',
      'Child section',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('Events')).toBeInTheDocument();
    await waitFor(() => expect(extraSections).toHaveBeenCalledWith(resource, { events: [] }));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('plugin failed'));
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Using legacy sectionsFunc'));
  });

  it('uses an explicit back link, and suppresses back navigation when rendered in a side panel', () => {
    vi.spyOn(ConfigMap, 'useGet').mockReturnValue(resourceResponse(makeResource()));
    const store = makeStore();
    const view = render(
      <TestContext store={store}>
        <ThemedContext>
          <DetailsGrid
            resourceType={ConfigMap}
            name="workload"
            backLink="/custom-list"
            noDefaultActions
          />
          <LocationProbe />
        </ThemedContext>
      </TestContext>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/custom-list');
    view.unmount();
    render(
      <TestContext store={store}>
        <ThemedContext>
          <DetailsGridContext.Provider value={{ isInPanel: true }}>
            <DetailsGrid
              resourceType={ConfigMap}
              name="workload"
              backLink="/custom-list"
              noDefaultActions
            />
          </DetailsGridContext.Provider>
        </ThemedContext>
      </TestContext>
    );
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('shows loading and fetch errors without a resource, and tolerates a false extra-sections result', () => {
    const get = vi.spyOn(ConfigMap, 'useGet').mockReturnValue(resourceResponse(null));
    const store = makeStore();
    const content = () => (
      <TestContext store={store}>
        <ThemedContext>
          <DetailsGrid
            resourceType={ConfigMap}
            name="workload"
            noDefaultActions
            extraSections={() => false}
          />
        </ThemedContext>
      </TestContext>
    );
    const view = render(content());
    expect(screen.getByRole('progressbar', { name: 'Loading resource data' })).toBeInTheDocument();
    get.mockReturnValue(resourceResponse(null, new ApiError('Access denied')));
    view.rerender(content());
    expect(screen.getByText('Error: Access denied')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('SecretField', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reveals UTF-8 data on demand and copies the decoded value without exposing it by default', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const secret = 'pässword 🔑';
    render(
      <TestContext>
        <span id="token-label">Token</span>
        <SecretField value={Base64.encode(secret)} nameID="token-label" />
      </TestContext>
    );
    expect(screen.getByDisplayValue('••••••••')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'toggle field visibility' }));
    expect(screen.getByDisplayValue(secret)).not.toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'toggle field visibility' }));
    expect(screen.getByDisplayValue('••••••••')).toHaveAttribute('readonly');

    const copy = screen.getByRole('button', { name: 'Copy to clipboard' });
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith(secret);
    fireEvent.mouseOver(copy);
    await act(async () => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Copied');
    await act(async () => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Copy to clipboard');
    expect(screen.getByDisplayValue('••••••••')).toBeInTheDocument();
  });

  it('disables copying empty secrets and reports clipboard rejection without exposing the value', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(<SecretField value="" />);
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeDisabled();
    view.rerender(<SecretField value={Base64.encode('private')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith('Error copying secret to clipboard: Error: clipboard denied')
    );
    expect(screen.queryByDisplayValue('private')).not.toBeInTheDocument();
  });
});

it('renders volume mount permissions and arranges all section grid items', () => {
  render(
    <TestContext>
      <ThemeProvider theme={createMuiTheme({ base: 'light', name: 'light' })}>
        <SectionGrid
          items={[
            <VolumeMounts key="empty" />,
            <VolumeMounts
              key="mounts"
              mounts={[
                { name: 'settings', mountPath: '/etc/app', readOnly: true },
                { name: 'data', mountPath: '/data', readOnly: false },
              ]}
            />,
            <div key="extra">Extra section</div>,
          ]}
        />
      </ThemeProvider>
    </TestContext>
  );
  expect(screen.getByText('/etc/app')).toBeInTheDocument();
  expect(screen.getByText('ReadOnly')).toBeInTheDocument();
  expect(screen.getByText('/data')).toBeInTheDocument();
  expect(screen.getByText('ReadWrite')).toBeInTheDocument();
  expect(screen.getByText('Extra section')).toBeInTheDocument();
});
