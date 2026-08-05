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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const enqueueSnackbar = vi.fn();
vi.mock('notistack', async importOriginal => {
  const actual = await importOriginal<typeof import('notistack')>();
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar }),
  };
});

import { TestContext } from '../../../test';
import CopyKubectlCommandButton, { getKubectlGetCommand } from './CopyKubectlCommandButton';

function makeItem(overrides: Record<string, any> = {}) {
  return {
    kind: 'Pod',
    isNamespaced: true,
    pluralName: 'pods',
    getName: () => 'my-pod',
    getNamespace: () => 'my-namespace',
    _class: () => ({ apiGroupName: undefined }),
    ...overrides,
  } as any;
}

describe('getKubectlGetCommand', () => {
  it('builds a namespaced get command', () => {
    expect(getKubectlGetCommand(makeItem())).toBe(
      'kubectl get pods my-pod -n my-namespace -o yaml'
    );
  });

  it('omits -n for cluster-scoped resources', () => {
    const item = makeItem({
      kind: 'Node',
      isNamespaced: false,
      pluralName: 'nodes',
      getName: () => 'my-node',
      getNamespace: () => undefined,
    });
    expect(getKubectlGetCommand(item)).toBe('kubectl get nodes my-node -o yaml');
  });

  it('qualifies the resource type with its API group for non-core resources', () => {
    const item = makeItem({
      kind: 'Deployment',
      isNamespaced: true,
      pluralName: 'widgets',
      getName: () => 'my-widget',
      _class: () => ({ apiGroupName: 'example.com' }),
    });
    expect(getKubectlGetCommand(item)).toBe(
      'kubectl get widgets.example.com my-widget -n my-namespace -o yaml'
    );
  });
});

describe('CopyKubectlCommandButton', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    enqueueSnackbar.mockClear();
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
  });

  it('renders nothing when no item is provided', () => {
    const { container } = render(
      <TestContext>
        <CopyKubectlCommandButton item={undefined as any} />
      </TestContext>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('copies the kubectl command to the clipboard when clicked', async () => {
    render(
      <TestContext>
        <CopyKubectlCommandButton item={makeItem()} />
      </TestContext>
    );

    fireEvent.click(await screen.findByLabelText('translation|Copy as kubectl command'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'kubectl get pods my-pod -n my-namespace -o yaml'
    );

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'translation|Copied kubectl command to clipboard.',
        { variant: 'success' }
      )
    );
  });

  it('shows an error snackbar when the clipboard write fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(
      <TestContext>
        <CopyKubectlCommandButton item={makeItem()} />
      </TestContext>
    );

    fireEvent.click(await screen.findByLabelText('translation|Copy as kubectl command'));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        'translation|Failed to copy kubectl command to clipboard.',
        { variant: 'error' }
      )
    );
  });
});
