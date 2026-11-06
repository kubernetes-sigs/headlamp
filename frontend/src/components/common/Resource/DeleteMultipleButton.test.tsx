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
const bulkState = vi.hoisted(() => ({
  allowEvict: (() => true) as (namespace: string) => boolean,
  failAuth: (() => false) as (namespace: string) => boolean,
  authCalls: [] as Array<{
    verb: string;
    subresource?: string;
    name?: string;
    namespace?: string;
    cluster?: string;
  }>,
  evictCalls: [] as string[],
  deleteCalls: [] as string[],
}));

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
      return this.jsonData?.cluster ?? '';
    }
    getName() {
      return this.jsonData?.metadata?.name ?? '';
    }
    getListLink() {
      return '/namespaces';
    }
    getNamespace() {
      return this.jsonData?.metadata?.namespace ?? '';
    }
    delete = async () => {
      bulkState.deleteCalls.push(this.getName());
    };
    getAuthorization = async (verb: string, attrs?: any) => {
      const attrsObject = attrs ?? {};
      const namespace = attrsObject.namespace ?? this.getNamespace();
      // Mirror KubeObject.getAuthorization: it seeds `name` from the object and
      // lets the caller override it, so an explicit `name: undefined` wins.
      const name = 'name' in attrsObject ? attrsObject.name : this.getName();
      bulkState.authCalls.push({
        verb,
        subresource: attrsObject.subresource,
        name,
        namespace,
        cluster: this.cluster,
      });

      if (bulkState.failAuth(namespace)) {
        throw new Error('authorization check failed');
      }

      return { status: { allowed: bulkState.allowEvict(namespace) } };
    };
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

// The real clusterAction waits out a 5s cancellation grace period before running
// the callback; unit tests execute it immediately instead.
vi.mock('../../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../redux/clusterActionSlice')>()),
  clusterAction: (callback: () => Promise<unknown>) => {
    void callback();
    return { type: 'clusterAction/test' };
  },
}));

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../../lib/k8s/namespace', () => ({ __esModule: true, default: MockNamespace }));
vi.mock('../../../lib/k8s/pod', () => ({
  __esModule: true,
  default: class Pod extends MockKubeObject {
    evict = async () => {
      bulkState.evictCalls.push(this.getName());
    };
  },
}));

import Pod from '../../../lib/k8s/pod';
import { setAppSettings } from '../../../redux/configSlice';
import store from '../../../redux/stores/store';
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

function makePod({
  name,
  namespace,
  cluster = '',
}: {
  name: string;
  namespace: string;
  cluster?: string;
}) {
  return new (Pod as any)({
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: { uid: `uid-${name}`, name, namespace },
    cluster,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    bulkState.allowEvict = () => true;
    bulkState.failAuth = () => false;
    bulkState.authCalls = [];
    bulkState.evictCalls = [];
    bulkState.deleteCalls = [];
    store.dispatch(setAppSettings({ useEvict: true }));
  });

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

  it('stays in sync with the production protected namespace list', async () => {
    const { default: RealNamespace } = await vi.importActual<{ default: typeof MockNamespace }>(
      '../../../lib/k8s/namespace'
    );
    expect(MockNamespace.PROTECTED_NAMESPACES).toEqual(RealNamespace.PROTECTED_NAMESPACES);
  });

  it('evicts selected pods when the user is allowed to evict', async () => {
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.evictCalls).toEqual(['pod-1']));
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.authCalls).toEqual([
      {
        verb: 'create',
        subresource: 'eviction',
        name: undefined,
        namespace: 'ns-1',
        cluster: '',
      },
    ]);
  });

  it('falls back to delete for selected pods when eviction is denied', async () => {
    bulkState.allowEvict = () => false;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-1']));
    expect(bulkState.evictCalls).toEqual([]);
  });

  it('checks eviction once per namespace and evicts only where allowed', async () => {
    bulkState.allowEvict = namespace => namespace === 'ns-allowed';
    renderButton([
      makePod({ name: 'pod-a', namespace: 'ns-allowed' }),
      makePod({ name: 'pod-b', namespace: 'ns-denied' }),
      makePod({ name: 'pod-c', namespace: 'ns-allowed' }),
      makePod({ name: 'pod-d', namespace: 'ns-denied' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls.sort()).toEqual(['pod-b', 'pod-d']));
    expect(bulkState.evictCalls.sort()).toEqual(['pod-a', 'pod-c']);
    expect(bulkState.authCalls.map(call => call.namespace).sort()).toEqual([
      'ns-allowed',
      'ns-denied',
    ]);
    expect(bulkState.authCalls.every(call => call.name === undefined)).toBe(true);
  });

  it('falls back to delete when the eviction authorization check fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bulkState.failAuth = () => true;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-1']));
    expect(bulkState.evictCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('deletes non-pod items without checking eviction', async () => {
    renderButton([makeNamespace({ name: 'my-app' })]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['my-app']));
    expect(bulkState.evictCalls).toEqual([]);
    expect(bulkState.authCalls).toEqual([]);
  });

  it('skips eviction checks when the useEvict setting is off', async () => {
    store.dispatch(setAppSettings({ useEvict: false }));
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-1']));
    expect(bulkState.evictCalls).toEqual([]);
    expect(bulkState.authCalls).toEqual([]);
  });

  it('checks eviction separately per cluster for the same namespace', async () => {
    renderButton([
      makePod({ name: 'pod-a', namespace: 'ns-1', cluster: 'cluster-a' }),
      makePod({ name: 'pod-b', namespace: 'ns-1', cluster: 'cluster-b' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.evictCalls.sort()).toEqual(['pod-a', 'pod-b']));
    expect(bulkState.authCalls.map(call => call.cluster).sort()).toEqual([
      'cluster-a',
      'cluster-b',
    ]);
  });

  it('continues the batch when one namespace authorization check fails', async () => {
    bulkState.failAuth = namespace => namespace === 'ns-error';
    renderButton([
      makePod({ name: 'pod-error', namespace: 'ns-error' }),
      makePod({ name: 'pod-ok', namespace: 'ns-ok' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-error']));
    expect(bulkState.evictCalls).toEqual(['pod-ok']);
  });
});
