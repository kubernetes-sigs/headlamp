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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Hoist mock classes before imports so vi.mock can use them. We mock KubeObject/namespace
// (rather than importing the real ones) to avoid a circular-import ordering issue in the
// lib/k8s barrel when these modules are loaded first by a unit test.
const { MockKubeObject, MockNamespace, authPolicy, mockSettings } = vi.hoisted(() => {
  // Decides the result of every getAuthorization() call. Tests override `allows` to
  // simulate a user who lacks permission for some or all of the selected items.
  type AuthCheck = (item: any, verb: string, attrs?: Record<string, any>) => boolean;
  const authPolicy: { allows: AuthCheck } = { allows: () => true };
  const mockSettings = { useEvict: true };

  class MockKubeObject {
    jsonData: any;
    static kind = '';
    static apiGroupName = '';
    constructor(data: any) {
      this.jsonData = data;
    }
    get metadata() {
      return this.jsonData?.metadata;
    }
    get kind() {
      return this.jsonData?.kind ?? (this.constructor as any).kind;
    }
    get cluster() {
      return '';
    }
    getName() {
      return this.jsonData?.metadata?.name ?? '';
    }
    getListLink() {
      return '/namespaces';
    }
    delete = async () => undefined;
    getAuthorization = vi.fn(async (verb: string, attrs?: Record<string, any>) => ({
      status: { allowed: authPolicy.allows(this, verb, attrs), reason: '' },
    }));
    _class() {
      return this.constructor as any;
    }
    static isClassOf(maybeInstance: any) {
      return (
        maybeInstance._class().apiGroupName === (this as any).apiGroupName &&
        maybeInstance.kind === (this as any).kind
      );
    }
  }

  class MockNamespace extends MockKubeObject {
    static kind = 'Namespace';
    static readonly PROTECTED_NAMESPACES = [
      'kube-system',
      'kube-node-lease',
      'kube-public',
      'default',
    ];
    isProtected() {
      const name = this.metadata.labels?.['kubernetes.io/metadata.name'] || this.metadata.name;
      return MockNamespace.PROTECTED_NAMESPACES.includes(name);
    }
  }

  return { MockKubeObject, MockNamespace, authPolicy, mockSettings };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../../lib/k8s/namespace', () => ({ __esModule: true, default: MockNamespace }));
vi.mock('../../../lib/k8s/pod', () => ({
  __esModule: true,
  default: class Pod extends MockKubeObject {},
}));
vi.mock('../../App/Settings/hook', () => ({ useSettings: () => mockSettings }));

import { TestContext } from '../../../test';
import DeleteMultipleButton from './DeleteMultipleButton';

function makeNamespace(metadata: Record<string, any>) {
  return new (MockNamespace as any)({
    kind: 'Namespace',
    apiVersion: 'v1',
    metadata: { uid: `uid-${metadata.name}`, ...metadata },
    status: { phase: 'Active' },
  });
}

function makePod(name: string) {
  return new (MockKubeObject as any)({
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: { uid: `uid-${name}`, name, namespace: 'default' },
  });
}

function renderButton(items: any) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <DeleteMultipleButton items={items} />
      </TestContext>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authPolicy.allows = () => true;
  mockSettings.useEvict = true;
});

// Opens the confirm dialog by clicking the Delete items button and returns the dialog element.
async function openDialog() {
  fireEvent.click(await screen.findByLabelText('translation|Delete items'));
  return await screen.findByRole('dialog');
}

describe('DeleteMultipleButton', () => {
  it('renders nothing when no items are provided', () => {
    const { container } = renderButton(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the warning and type-to-confirm field when protected namespaces are included', async () => {
    renderButton([makeNamespace({ name: 'kube-system' }), makeNamespace({ name: 'my-app' })]);
    const dialog = await openDialog();

    expect(
      within(dialog).getByText(
        'translation|Your selection includes system namespaces. Deleting them may break your cluster.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('translation|Namespace name(s)')).toBeInTheDocument();
  });

  it('keeps Confirm disabled until the normalized input matches every protected namespace', async () => {
    renderButton([
      makeNamespace({ name: 'kube-system' }),
      makeNamespace({ name: 'default' }),
      makeNamespace({ name: 'my-app' }),
    ]);
    const dialog = await openDialog();

    const confirmButton = within(dialog).getByTestId('confirm-button');
    const input = within(dialog).getByLabelText('translation|Namespace name(s)');

    expect(confirmButton).toBeDisabled();

    // A single protected name is not enough while another remains unconfirmed.
    fireEvent.change(input, { target: { value: 'kube-system' } });
    expect(confirmButton).toBeDisabled();

    // Both names, in any order and with extra whitespace, enable Confirm.
    fireEvent.change(input, { target: { value: '  default ,  kube-system  ' } });
    await waitFor(() => expect(confirmButton).toBeEnabled());
  });

  it('keeps the standard flow (no warning or field) when no protected namespaces are included', async () => {
    renderButton([makeNamespace({ name: 'my-app' }), makeNamespace({ name: 'team-b' })]);
    const dialog = await openDialog();

    expect(
      within(dialog).queryByText(
        'translation|Your selection includes system namespaces. Deleting them may break your cluster.'
      )
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText('translation|Namespace name(s)')
    ).not.toBeInTheDocument();

    // Confirm is enabled right away — no type-to-confirm step.
    expect(within(dialog).getByTestId('confirm-button')).toBeEnabled();
  });

  it('renders nothing when the user cannot delete any of the selected items', async () => {
    authPolicy.allows = () => false;
    const items = [makeNamespace({ name: 'my-app' }), makeNamespace({ name: 'team-b' })];
    const { container } = renderButton(items);

    // Wait for every RBAC check to resolve before asserting the button stays hidden.
    await waitFor(() => items.forEach(item => expect(item.getAuthorization).toHaveBeenCalled()));
    expect(container).toBeEmptyDOMElement();
  });

  it('only offers to delete the items the user is authorized to delete', async () => {
    authPolicy.allows = item => item.metadata.name !== 'team-b';
    renderButton([makeNamespace({ name: 'my-app' }), makeNamespace({ name: 'team-b' })]);
    const dialog = await openDialog();

    expect(within(dialog).getByText(/my-app/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/team-b/)).not.toBeInTheDocument();
  });

  it('skips the protected namespace confirmation for protected namespaces the user cannot delete', async () => {
    authPolicy.allows = item => item.metadata.name !== 'kube-system';
    renderButton([makeNamespace({ name: 'kube-system' }), makeNamespace({ name: 'my-app' })]);
    const dialog = await openDialog();

    expect(
      within(dialog).queryByLabelText('translation|Namespace name(s)')
    ).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('confirm-button')).toBeEnabled();
  });

  it('checks the eviction permission for pods when eviction is enabled', async () => {
    mockSettings.useEvict = true;
    const pod = makePod('web-0');
    const namespace = makeNamespace({ name: 'my-app' });
    renderButton([pod, namespace]);

    await screen.findByLabelText('translation|Delete items');
    expect(pod.getAuthorization).toHaveBeenCalledWith('create', { subresource: 'eviction' });
    expect(pod.getAuthorization).not.toHaveBeenCalledWith('delete');
    expect(namespace.getAuthorization).toHaveBeenCalledWith('delete');
  });

  it('checks the delete permission for pods when eviction is disabled', async () => {
    mockSettings.useEvict = false;
    const pod = makePod('web-0');
    renderButton([pod]);

    await screen.findByLabelText('translation|Delete items');
    expect(pod.getAuthorization).toHaveBeenCalledWith('delete');
    expect(pod.getAuthorization).not.toHaveBeenCalledWith('create', { subresource: 'eviction' });
  });

  it('stays in sync with the production protected namespace list', async () => {
    const { default: RealNamespace } = await vi.importActual<{ default: typeof MockNamespace }>(
      '../../../lib/k8s/namespace'
    );
    expect(MockNamespace.PROTECTED_NAMESPACES).toEqual(RealNamespace.PROTECTED_NAMESPACES);
  });
});
