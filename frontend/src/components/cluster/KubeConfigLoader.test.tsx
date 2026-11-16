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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as yaml from 'js-yaml';
import { decodeBase64 } from '../../helpers/base64';
import { setCluster } from '../../lib/k8s/api/v1/clusterApi';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import KubeConfigLoader, { PureKubeConfigLoader, Step } from './KubeConfigLoader';

vi.mock('../../lib/k8s/api/v1/clusterApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/clusterApi')>()),
  setCluster: vi.fn(),
}));

function config(name: string) {
  return {
    clusters: [{ name, cluster: { server: `https://${name}.example.com` } }],
    users: [{ name, user: { token: `${name}-token` } }],
    contexts: [{ name, context: { cluster: name, user: name } }],
  };
}

function file(name: string, value: unknown) {
  return new File([yaml.dump(value)], name, { type: 'application/yaml' });
}

function renderLoader() {
  const result = render(
    <TestContext>
      <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
        <KubeConfigLoader />
      </ThemeProvider>
    </TestContext>
  );
  const input = result.baseElement.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error('Missing file input');
  }
  return { ...result, input };
}

function submittedConfig() {
  const request = vi.mocked(setCluster).mock.lastCall?.[0];
  if (!request?.kubeconfig) {
    throw new Error('No kubeconfig submitted');
  }
  return yaml.load(decodeBase64(request.kubeconfig));
}

async function importFiles(input: Element, files: File[]) {
  fireEvent.change(input, { target: { files } });
  await screen.findByText('Select clusters');
}

describe('KubeConfigLoader', () => {
  beforeEach(() => {
    vi.mocked(setCluster).mockReset();
    vi.mocked(setCluster).mockResolvedValue({ clusters: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the multi-file picker only once per button click', () => {
    const { input } = renderLoader();
    expect(input).toHaveAttribute('multiple');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(
      screen.getByRole('button', { name: 'Drag & drop or choose kubeconfig files here' })
    );
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('merges files and submits only the selected contexts and their dependencies', async () => {
    const { input } = renderLoader();
    await importFiles(input, [
      file('first.yaml', config('first')),
      file('second.yaml', config('second')),
    ]);
    expect(screen.getByRole('checkbox', { name: 'first' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'second' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(submittedConfig()).toMatchObject(config('second'));
  });

  it('accepts multiple files via drag and drop', async () => {
    const { input } = renderLoader();
    const dropzone = input.closest('[role="presentation"]');
    if (!dropzone) {
      throw new Error('Missing dropzone');
    }
    const files = [file('first.yaml', config('first')), file('second.yaml', config('second'))];
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files,
        items: files.map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })),
        types: ['Files'],
      },
    });
    await screen.findByRole('checkbox', { name: 'first' });
    expect(screen.getByRole('checkbox', { name: 'second' })).toBeChecked();
  });

  it('keeps the first duplicate entry and warns about skipped entries', async () => {
    const { input } = renderLoader();
    const duplicate = config('first');
    duplicate.clusters[0].cluster.server = 'https://other.example.com';
    duplicate.users[0].user.token = 'other-token';
    await importFiles(input, [
      file('first.yaml', config('first')),
      file('duplicate.yaml', duplicate),
    ]);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Duplicate kubeconfig entries were skipped (first occurrence wins)'
    );
    expect(
      within(screen.getByRole('alert'))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual([
      'duplicate.yaml: Cluster "first"',
      'duplicate.yaml: User "first"',
      'duplicate.yaml: Context "first"',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submittedConfig()).toMatchObject(config('first'));
  });

  it('loads valid files despite parse failures and clears warnings when proceeding', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input } = renderLoader();
    await importFiles(input, [new File(['['], 'broken.yaml'), file('valid.yaml', config('valid'))]);
    expect(screen.getByRole('alert')).toHaveTextContent('1 file could not be loaded');
    expect(screen.getByRole('alert')).toHaveClass('MuiAlert-standardWarning');
    expect(screen.getByRole('alert')).toHaveTextContent('broken.yaml:');
    expect(within(screen.getByRole('alert')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('alert')).getByRole('listitem')).toHaveTextContent(
      'broken.yaml:'
    );
    expect(screen.getByText('1 file could not be loaded').closest('li')).toBeNull();
    expect(screen.getByText('1 file could not be loaded')).toHaveClass('MuiAlertTitle-root');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pluralizes multiple failed files while still submitting all valid contexts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input } = renderLoader();
    await importFiles(input, [
      file('empty.yaml', {}),
      new File(['['], 'broken.yaml'),
      file('first.yaml', config('first')),
      file('second.yaml', config('second')),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('2 files could not be loaded');
    expect(within(screen.getByRole('alert')).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(submittedConfig()).toMatchObject({
      clusters: [...config('first').clusters, ...config('second').clusters],
      users: [...config('first').users, ...config('second').users],
      contexts: [...config('first').contexts, ...config('second').contexts],
    });
  });

  it.each([
    null,
    'not a config',
    { clusters: {}, contexts: [] },
    { clusters: [], contexts: [] },
    { ...config('bad'), users: {} },
    { ...config('bad'), users: [{ name: 'bad', user: { token: 42 } }] },
    { ...config('bad'), clusters: [null] },
    { ...config('bad'), clusters: [{ name: 'bad', cluster: {} }] },
    { ...config('bad'), contexts: [null] },
    { ...config('bad'), contexts: [{ name: 'bad', context: { cluster: 42 } }] },
    { ...config('bad'), contexts: [{ name: 'bad', context: { cluster: 'missing' } }] },
  ])('rejects malformed entries without contaminating valid imports: %j', async invalid => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input } = renderLoader();
    await importFiles(input, [file('invalid.yaml', invalid), file('valid.yaml', config('valid'))]);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'valid' })).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('invalid.yaml:');
  });

  it('shows a contexts error and individual filenames when all files fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input } = renderLoader();
    fireEvent.change(input, {
      target: { files: [file('empty.yaml', {}), new File(['['], 'broken.yaml')] },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No valid kubeconfig contexts found in the selected files');
    expect(alert).toHaveTextContent('empty.yaml:');
    expect(alert).toHaveTextContent('broken.yaml:');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByText('No valid kubeconfig contexts found in the selected files').closest('li')
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Drag & drop or choose kubeconfig files here' })
    ).toBeVisible();
    await importFiles(input, [file('valid.yaml', config('valid'))]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([[], undefined, null, [{ name: 'other-user', user: { token: 'unrelated-token' } }]])(
    'rejects unresolved named users atomically before a valid conflicting file: %j',
    async users => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const invalid = {
        ...config('shared'),
        users,
        clusters: [{ name: 'shared', cluster: { server: 'https://invalid.example.com' } }],
        contexts: [{ name: 'shared', context: { cluster: 'shared', user: 'missing-user' } }],
      };
      const { input } = renderLoader();
      await importFiles(input, [
        file('missing-user.yaml', invalid),
        file('valid.yaml', config('shared')),
      ]);
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'missing-user.yaml: Kubeconfig contexts reference missing users'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Clusters successfully set up!');
      expect(submittedConfig()).toMatchObject(config('shared'));
    }
  );

  it('reports read failures without rejecting the remaining files', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = FileReader.prototype.readAsArrayBuffer;
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
      .mockImplementationOnce(function (this: FileReader) {
        this.dispatchEvent(new ProgressEvent('error'));
      })
      .mockImplementation(read);
    const { input } = renderLoader();
    await importFiles(input, [
      file('unreadable.yaml', config('bad')),
      file('valid.yaml', config('valid')),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "unreadable.yaml: Couldn't read kubeconfig file"
    );
  });

  it('reports aborted reads without leaving the import pending', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementationOnce(function (
      this: FileReader
    ) {
      this.dispatchEvent(new ProgressEvent('abort'));
    });
    const { input } = renderLoader();
    fireEvent.change(input, { target: { files: [file('aborted.yaml', config('bad'))] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'aborted.yaml: File reading was aborted'
    );
  });

  it('clears a previous configuration error when retrying successfully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(setCluster).mockRejectedValueOnce(new Error('Server unavailable'));
    const { input } = renderLoader();
    await importFiles(input, [file('valid.yaml', config('valid'))]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error setting up clusters');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles large UTF-8 files and anonymous contexts', async () => {
    const { input } = renderLoader();
    const name = 'développement-日本語';
    await importFiles(input, [
      file('large.yaml', {
        ...config(name),
        users: undefined,
        contexts: [{ name, context: { cluster: name } }],
        padding: 'x'.repeat(250_000),
      }),
    ]);
    expect(screen.getByRole('checkbox', { name })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(submittedConfig()).toMatchObject({
      clusters: config(name).clusters,
      users: [{ name: 'headlamp-anonymous', user: {} }],
      contexts: [{ name, context: { cluster: name, user: 'headlamp-anonymous' } }],
    });
  });

  it('normalizes missing and empty users without reusing authenticated user names', async () => {
    const { input } = renderLoader();
    await importFiles(input, [
      file('anonymous.yaml', {
        ...config('anonymous'),
        users: [
          { name: 'headlamp-anonymous', user: { token: 'keep-this-token' } },
          { name: 'headlamp-anonymous-1', user: { token: 'unused-token' } },
        ],
        contexts: [
          { name: 'anonymous', context: { cluster: 'anonymous', namespace: 'default' } },
          { name: 'empty-user', context: { cluster: 'anonymous', user: '' } },
          {
            name: 'authenticated',
            context: { cluster: 'anonymous', user: 'headlamp-anonymous' },
          },
        ],
      }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(submittedConfig()).toMatchObject({
      users: [
        { name: 'headlamp-anonymous-2', user: {} },
        { name: 'headlamp-anonymous', user: { token: 'keep-this-token' } },
      ],
      contexts: [
        {
          name: 'anonymous',
          context: {
            cluster: 'anonymous',
            user: 'headlamp-anonymous-2',
            namespace: 'default',
          },
        },
        { name: 'empty-user', context: { user: 'headlamp-anonymous-2' } },
        { name: 'authenticated', context: { user: 'headlamp-anonymous' } },
      ],
    });
  });

  it('preserves order and first occurrences across large overlapping inventories', async () => {
    const { input } = renderLoader();
    const names = Array.from({ length: 250 }, (_, index) => `cluster-${index}`);
    const inventory = (entries: string[]) => ({
      clusters: entries.flatMap(name => config(name).clusters),
      users: entries.flatMap(name => config(name).users),
      contexts: entries.flatMap(name => config(name).contexts),
    });
    await importFiles(input, [
      file('first.yaml', inventory(names.slice(0, 150))),
      file('second.yaml', inventory(names.slice(100))),
    ]);
    expect(screen.getAllByRole('checkbox').map(checkbox => checkbox.getAttribute('value'))).toEqual(
      names
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Clusters successfully set up!');
    expect(submittedConfig()).toMatchObject({
      contexts: names.map(name => ({ name })),
    });
  });

  it('clears warnings when returning to choose another file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input } = renderLoader();
    await importFiles(input, [file('empty.yaml', {}), file('valid.yaml', config('valid'))]);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drag & drop or choose kubeconfig files here' })
    ).toBeVisible();
  });

  it('does not show import warnings on the success screen', () => {
    render(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <PureKubeConfigLoader
            step={Step.Success}
            warnings={[{ message: 'Import warning' }]}
            fileContent={{ ...config('valid'), currentContext: '' }}
            selectedClusters={['valid']}
            onDrop={vi.fn()}
            onCheckboxChange={vi.fn()}
            onNext={vi.fn()}
            onBack={vi.fn()}
            onFinish={vi.fn()}
            onCancel={vi.fn()}
          />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles empty file selection without throwing', async () => {
    const { input } = renderLoader();
    fireEvent.change(input, { target: { files: [] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No kubeconfig files selected');
    });
    expect(screen.getByText('No kubeconfig files selected')).not.toHaveClass('MuiAlertTitle-root');
  });
});
