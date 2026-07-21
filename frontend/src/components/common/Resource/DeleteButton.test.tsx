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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Hoist mock classes before imports so vi.mock can use them. We mock KubeObject/namespace
// (rather than importing the real ones) to avoid a circular-import ordering issue in the
// lib/k8s barrel when these modules are loaded first by a unit test.
const { MockKubeObject, MockNamespace } = vi.hoisted(() => {
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

  return { MockKubeObject, MockNamespace };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../../lib/k8s/namespace', () => ({ __esModule: true, default: MockNamespace }));
vi.mock('../../../lib/k8s/pod', () => ({
  __esModule: true,
  default: class Pod extends MockKubeObject {},
}));

// Render the children unconditionally so we don't depend on the async authorization query.
vi.mock('./AuthVisible', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

import { TestContext } from '../../../test';
import DeleteButton from './DeleteButton';

function makeNamespace(metadata: Record<string, any>) {
  return new (MockNamespace as any)({
    kind: 'Namespace',
    apiVersion: 'v1',
    metadata: { uid: `uid-${metadata.name}`, ...metadata },
    status: { phase: 'Active' },
  });
}

function renderButton(item: any) {
  return render(
    <TestContext>
      <DeleteButton item={item} />
    </TestContext>
  );
}

// Opens the confirm dialog by clicking the Delete button and returns the dialog element.
async function openDialog() {
  fireEvent.click(await screen.findByLabelText('translation|Delete'));
  return await screen.findByRole('dialog');
}

describe('DeleteButton', () => {
  it('renders nothing when no item is provided', () => {
    const { container } = renderButton(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the warning and type-to-confirm field for a protected namespace', async () => {
    renderButton(makeNamespace({ name: 'kube-system' }));
    const dialog = await openDialog();

    expect(
      within(dialog).getByText(
        'translation|This is a system namespace. Deleting it may break your cluster.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('translation|Namespace name')).toBeInTheDocument();
  });

  it('keeps Confirm disabled until the exact protected namespace name is typed', async () => {
    renderButton(makeNamespace({ name: 'kube-system' }));
    const dialog = await openDialog();

    const confirmButton = within(dialog).getByLabelText('confirm-button');
    const input = within(dialog).getByLabelText('translation|Namespace name');

    expect(confirmButton).toBeDisabled();

    // Wrong value keeps it disabled.
    fireEvent.change(input, { target: { value: 'kube' } });
    expect(confirmButton).toBeDisabled();

    // Correct value (surrounding whitespace is trimmed) enables it.
    fireEvent.change(input, { target: { value: '  kube-system  ' } });
    await waitFor(() => expect(confirmButton).toBeEnabled());
  });

  it('uses the kubernetes.io/metadata.name label (not metadata.name) for the confirm value', async () => {
    // Protection is decided by the label, so the confirmation must match that same value.
    renderButton(
      makeNamespace({
        name: 'renamed-object',
        labels: { 'kubernetes.io/metadata.name': 'kube-system' },
      })
    );
    const dialog = await openDialog();

    const confirmButton = within(dialog).getByLabelText('confirm-button');
    const input = within(dialog).getByLabelText('translation|Namespace name');

    // The object's metadata.name should NOT unlock deletion.
    fireEvent.change(input, { target: { value: 'renamed-object' } });
    expect(confirmButton).toBeDisabled();

    // The label value is what enables it.
    fireEvent.change(input, { target: { value: 'kube-system' } });
    await waitFor(() => expect(confirmButton).toBeEnabled());
  });

  it('keeps the standard single-confirmation flow for a non-protected namespace', async () => {
    renderButton(makeNamespace({ name: 'my-app' }));
    const dialog = await openDialog();

    expect(
      within(dialog).queryByText(
        'translation|This is a system namespace. Deleting it may break your cluster.'
      )
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('translation|Namespace name')).not.toBeInTheDocument();

    // Confirm is enabled right away — no type-to-confirm step.
    expect(within(dialog).getByLabelText('confirm-button')).toBeEnabled();
  });

  it('stays in sync with the production protected namespace list', async () => {
    const { default: RealNamespace } = await vi.importActual<{ default: typeof MockNamespace }>(
      '../../../lib/k8s/namespace'
    );
    expect(MockNamespace.PROTECTED_NAMESPACES).toEqual(RealNamespace.PROTECTED_NAMESPACES);
  });
});
