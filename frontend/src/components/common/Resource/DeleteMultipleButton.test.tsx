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

const { MockKubeObject, MockNamespace } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    static kind = '';
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
  }

  class MockNamespace extends MockKubeObject {
    static kind = 'Namespace';
    // Mirrors the production list/logic in src/lib/k8s/namespace.ts.
    static readonly PROTECTED_NAMESPACES = [
      'kube-system',
      'kube-node-lease',
      'kube-public',
      'default',
    ];
    isProtected() {
      const name = this.metadata.labels?.['kubernetes.io/metadata.name'] ?? this.metadata.name;
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

function renderButton(items: any) {
  return render(
    <TestContext>
      <DeleteMultipleButton items={items} />
    </TestContext>
  );
}

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

    const confirmButton = within(dialog).getByLabelText('confirm-button');
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
    expect(within(dialog).getByLabelText('confirm-button')).toBeEnabled();
  });
});
