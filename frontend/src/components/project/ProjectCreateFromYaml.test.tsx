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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { TestContext } from '../../test';
import { CreateNew, splitKubernetesResources } from './ProjectCreateFromYaml';
import { PROJECT_ID_LABEL } from './projectUtils';

const { apply, push, namespaces } = vi.hoisted(() => ({
  apply: vi.fn(),
  push: vi.fn(),
  namespaces: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({ 'cluster-a': { name: 'cluster-a' } }),
}));
vi.mock('../../lib/k8s/namespace', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/k8s/namespace')>();
  return {
    ...actual,
    default: class extends actual.default {
      static useList = namespaces;
    },
  };
});
vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply }));
vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useHistory: () => ({ push }),
}));
vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: (route: string, params?: { name: string }) =>
    params ? `/projects/${params.name}` : `/${route}`,
}));
vi.mock('../advancedSearch/ResourceSearch', () => ({
  ViewYaml: () => <span>View YAML</span>,
}));
vi.mock('../resourceMap/kubeIcon/KubeIcon', () => ({
  KubeIcon: () => <span />,
}));
vi.mock('../common/Table', () => ({
  default: ({ data }: { data: KubeObjectInterface[] }) => (
    <ul>
      {data.map(item => (
        <li key={item.metadata.name}>{item.metadata.name}</li>
      ))}
    </ul>
  ),
}));

const yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
  namespace: original
---
---
apiVersion: v1
kind: Secret
metadata:
  name: credentials
  namespace: original
`;

function renderForm() {
  return render(
    <TestContext>
      <CreateNew />
    </TestContext>
  );
}

function fillProject() {
  fireEvent.change(screen.getByLabelText(/Project Name/), { target: { value: 'New Project' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Clusters/ }));
  fireEvent.click(screen.getByText('cluster-a'));
}

async function loadUrl(content = yaml) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(content));
  vi.stubGlobal('fetch', fetch);
  fireEvent.click(screen.getByRole('tab', { name: 'Load from URL' }));
  fireEvent.change(screen.getByLabelText('YAML URL'), {
    target: { value: 'https://example.test/project.yaml' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  await screen.findByText('settings');
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  namespaces.mockReturnValue({ items: [] });
  apply.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('rejects an empty form and lets the user return to the chooser without creating resources', () => {
  renderForm();
  fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!);

  expect(screen.getByText('Name is required')).toBeInTheDocument();
  expect(screen.getByText('No resources have been uploaded')).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(push).toHaveBeenCalledWith('/chooser');
});

it('blocks duplicate normalized project names from existing namespaces', () => {
  namespaces.mockReturnValue({
    items: [
      { metadata: { labels: {} } },
      { metadata: { labels: { [PROJECT_ID_LABEL]: 'New Project' } } },
    ],
  });
  renderForm();
  fillProject();
  fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!);

  expect(screen.getByText('A project with this name already exists')).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});

it('loads nonempty YAML documents from a URL and can clear them', async () => {
  renderForm();
  const fetch = await loadUrl();

  expect(fetch).toHaveBeenCalledWith('https://example.test/project.yaml');
  expect(screen.getByText('credentials')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
  expect(screen.queryByText('settings')).not.toBeInTheDocument();
  expect(screen.queryByText('credentials')).not.toBeInTheDocument();
});

it.each([
  [
    'HTTP failure',
    () => Promise.resolve(new Response('', { status: 503, statusText: 'Unavailable' })),
    'HTTP 503',
  ],
  ['network failure', () => Promise.reject(new Error('offline')), 'offline'],
])('shows URL loading errors for %s', async (_name, response, message) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(response));
  renderForm();
  fireEvent.click(screen.getByRole('tab', { name: 'Load from URL' }));
  fireEvent.change(screen.getByLabelText('YAML URL'), {
    target: { value: 'https://example.test/bad.yaml' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));

  expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();
  expect(apply).not.toHaveBeenCalled();
});

it('uploads multiple YAML documents through the file input', async () => {
  renderForm();
  const file = new File([yaml], 'project.yaml', { type: 'application/x-yaml' });
  fireEvent.change(screen.getByLabelText('Choose Files'), { target: { files: [file] } });

  expect(await screen.findByText('settings')).toBeInTheDocument();
  expect(screen.getByText('credentials')).toBeInTheDocument();
});

it('keeps Kubernetes resources and reports why each other YAML document is rejected', () => {
  const configMap = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' } };

  expect(
    splitKubernetesResources([
      configMap,
      null,
      undefined,
      'a plain string',
      [configMap],
      { apiVersion: 'kustomize.config.k8s.io/v1beta1', kind: 'Kustomization', resources: [] },
      { apiVersion: 'v1', kind: 'ConfigMap', metadata: {} },
      { replicaCount: 2 },
      { apiVersion: '', kind: '', metadata: { name: '' } },
    ])
  ).toEqual({
    resources: [configMap],
    rejected: [
      { index: 4, missingFields: [] },
      { index: 5, missingFields: [] },
      { index: 6, missingFields: ['metadata.name'] },
      { index: 7, missingFields: ['metadata.name'] },
      { index: 8, missingFields: ['apiVersion', 'kind', 'metadata.name'] },
      { index: 9, missingFields: ['apiVersion', 'kind', 'metadata.name'] },
    ],
  });
});

it.each([
  ['the file input', 'file'],
  ['a URL', 'url'],
])('lists each YAML document that is not a Kubernetes resource from %s', async (_name, source) => {
  const mixed = `${yaml}---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - settings.yaml
`;
  renderForm();
  if (source === 'url') {
    await loadUrl(mixed);
  } else {
    const file = new File([mixed], 'project.yaml', { type: 'application/x-yaml' });
    fireEvent.change(screen.getByLabelText('Choose Files'), { target: { files: [file] } });
  }

  expect(await screen.findByText('settings')).toBeInTheDocument();
  expect(screen.getByText('credentials')).toBeInTheDocument();
  const name = source === 'url' ? 'https://example.test/project.yaml' : 'project.yaml';
  expect(screen.getByRole('alert')).toHaveTextContent(`${name}, document 4: metadata.name not set`);

  fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('lets the user clear an upload that has only rejected documents', async () => {
  renderForm();
  const kustomization = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: []
`;
  const file = new File([kustomization], 'kustomization.yaml', { type: 'application/x-yaml' });
  fireEvent.change(screen.getByLabelText('Choose Files'), { target: { files: [file] } });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'kustomization.yaml, document 1: metadata.name not set'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear All' })).not.toBeInTheDocument();
});

it('logs malformed YAML uploads without adding invalid resources', async () => {
  const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
  renderForm();
  const file = new File(['invalid: [yaml'], 'invalid.yaml', { type: 'application/x-yaml' });
  fireEvent.change(screen.getByLabelText('Choose Files'), { target: { files: [file] } });

  await waitFor(() =>
    expect(logError).toHaveBeenCalledWith(
      'Error parsing YAML file:',
      'invalid.yaml',
      expect.any(Error)
    )
  );
  expect(screen.queryByRole('button', { name: 'Clear All' })).not.toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});

it('reports file-reading failures without applying partial resources', async () => {
  const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
    this.dispatchEvent(new ProgressEvent('error'));
  });
  renderForm();
  const file = new File([yaml], 'project.yaml', { type: 'application/x-yaml' });
  fireEvent.change(screen.getByLabelText('Choose Files'), { target: { files: [file] } });

  expect(await screen.findByText(/Error processing files:/)).toBeInTheDocument();
  expect(logError).toHaveBeenCalledWith(
    'An error occurred while processing files.',
    expect.any(ProgressEvent)
  );
  expect(apply).not.toHaveBeenCalled();
});

it('creates the namespace first, reports progress, then applies resources in that namespace', async () => {
  let finishResource!: (value: object) => void;
  const pending = new Promise(resolve => {
    finishResource = resolve;
  });
  apply.mockResolvedValueOnce({}).mockReturnValueOnce(pending).mockResolvedValue({});
  renderForm();
  fillProject();
  await loadUrl();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));

  expect(await screen.findByText('Creating project')).toBeInTheDocument();
  expect(screen.getByText('new-project')).toBeInTheDocument();
  expect(screen.getByText('settings')).toBeInTheDocument();
  expect(apply).toHaveBeenNthCalledWith(
    1,
    {
      kind: 'Namespace',
      apiVersion: 'v1',
      metadata: { name: 'new-project', labels: { [PROJECT_ID_LABEL]: 'new-project' } },
    },
    'cluster-a'
  );
  expect(apply).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      kind: 'ConfigMap',
      metadata: { name: 'settings', namespace: 'new-project' },
    }),
    'cluster-a'
  );

  await act(async () => {
    finishResource({});
  });

  await waitFor(() => expect(apply).toHaveBeenCalledTimes(3));
  expect(apply).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      kind: 'Secret',
      metadata: { name: 'credentials', namespace: 'new-project' },
    }),
    'cluster-a'
  );
  expect(push).toHaveBeenCalledWith('/projects/new-project');
});

it('applies the remaining resources after a failure and reports what failed', async () => {
  apply.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('permission denied'));
  renderForm();
  fillProject();
  await loadUrl();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));

  expect(await screen.findByText('Some resources could not be created')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('ConfigMap settings: permission denied');
  expect(screen.getByText('Secret credentials')).toBeInTheDocument();
  expect(apply).toHaveBeenCalledTimes(3);
  expect(apply).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'Secret',
      metadata: expect.objectContaining({ name: 'credentials' }),
    }),
    'cluster-a'
  );
  expect(push).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Go to project' }));
  expect(push).toHaveBeenCalledWith('/projects/new-project');
});

it('stops and shows the error when the namespace cannot be created', async () => {
  apply.mockRejectedValueOnce(new Error('namespaces is forbidden'));
  renderForm();
  fillProject();
  await loadUrl();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));

  expect(await screen.findByText('namespaces is forbidden')).toBeInTheDocument();
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  expect(apply).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
});
