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
  useTranslation: () => ({
    // Interpolate the values so assertions can check the rendered message.
    t: (key: string, options?: Record<string, unknown>) =>
      key.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) =>
        options && name in options ? String(options[name]) : placeholder
      ),
  }),
}));

// Hoist mock classes before imports so vi.mock can use them. We mock KubeObject/namespace
// (rather than importing the real ones) to avoid a circular-import ordering issue in the
// lib/k8s barrel when these modules are loaded first by a unit test.
const bulkState = vi.hoisted(() => ({
  allowEvict: (() => true) as (namespace: string, name?: string) => boolean,
  failAuth: (() => false) as (namespace: string, name?: string) => boolean,
  evaluationError: (() => false) as (namespace: string, name?: string) => boolean,
  allowWithEvaluationError: (() => false) as (namespace: string, name?: string) => boolean,
  emptyStatus: (() => false) as (namespace: string, name?: string) => boolean,
  failDelete: (() => false) as (name: string) => boolean,
  authCalls: [] as Array<{
    verb: string;
    subresource?: string;
    name?: string;
    namespace?: string;
    cluster?: string;
  }>,
  evictCalls: [] as string[],
  deleteCalls: [] as string[],
  // The action options the component dispatched, and the promise from its callback.
  actionOptions: undefined as any,
  actionResult: Promise.resolve() as Promise<unknown>,
  actionCalls: 0,
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
      if (bulkState.failDelete(this.getName())) {
        throw new Error(`failed to delete ${this.getName()}`);
      }
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

      if (bulkState.failAuth(namespace, name)) {
        throw new Error('authorization check failed');
      }

      if (bulkState.evaluationError(namespace, name)) {
        return { status: { allowed: false, evaluationError: 'authorizer webhook failed' } };
      }

      if (bulkState.allowWithEvaluationError(namespace, name)) {
        return { status: { allowed: true, evaluationError: 'one authorizer failed' } };
      }

      if (bulkState.emptyStatus(namespace, name)) {
        return { status: {} };
      }

      return { status: { allowed: bulkState.allowEvict(namespace, name) } };
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
// the callback; unit tests execute it immediately instead. The options and the
// pending callback promise are kept so tests can assert the notification text and
// the outcome, including rejections.
vi.mock('../../../redux/clusterActionSlice', async importOriginal => {
  const actual = (await importOriginal()) as typeof import('../../../redux/clusterActionSlice');
  return {
    ...actual,
    clusterAction: (callback: () => Promise<unknown>, options: any) => {
      bulkState.actionCalls += 1;
      bulkState.actionOptions = options;
      const result = Promise.resolve().then(callback);
      // Mark the outcome as observed so a rejected batch is not reported as an
      // unhandled rejection; tests can still await `actionResult` to inspect it.
      result.catch(() => undefined);
      bulkState.actionResult = result;
      return { type: 'clusterAction/test' };
    },
  };
});

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
    bulkState.evaluationError = () => false;
    bulkState.allowWithEvaluationError = () => false;
    bulkState.emptyStatus = () => false;
    bulkState.failDelete = () => false;
    bulkState.authCalls = [];
    bulkState.evictCalls = [];
    bulkState.deleteCalls = [];
    bulkState.actionOptions = undefined;
    bulkState.actionResult = Promise.resolve();
    bulkState.actionCalls = 0;
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
    // One namespace check plus one named check for this Pod.
    expect(bulkState.authCalls).toHaveLength(2);
    // The user is told the Pod was deleted rather than evicted.
    expect(bulkState.actionOptions.successMessage).toBe(
      'Deleted 1 items. Pods deleted instead of evicted because eviction is not permitted: ns-1/pod-1.'
    );
    expect(bulkState.actionOptions.successOptions).toEqual({ variant: 'warning' });
  });

  it('names at most five pods in the notification', async () => {
    bulkState.allowEvict = () => false;
    renderButton(
      Array.from({ length: 7 }, (_, index) =>
        makePod({ name: `pod-${index + 1}`, namespace: 'ns-1' })
      )
    );
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toHaveLength(7));
    expect(bulkState.actionOptions.successMessage).toBe(
      'Deleted 7 items. Pods deleted instead of evicted because eviction is not permitted: ' +
        'ns-1/pod-1, ns-1/pod-2, ns-1/pod-3, ns-1/pod-4, ns-1/pod-5 and 2 more.'
    );
  });

  it('checks the namespace first, then each pod only after a namespace denial', async () => {
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

    const namespaceChecks = bulkState.authCalls.filter(call => call.name === undefined);
    const podChecks = bulkState.authCalls.filter(call => call.name !== undefined);

    // One namespace-wide check per namespace; named checks only for the denied namespace.
    expect(namespaceChecks.map(call => call.namespace).sort()).toEqual(['ns-allowed', 'ns-denied']);
    expect(podChecks.map(call => call.name).sort()).toEqual(['pod-b', 'pod-d']);
    expect(bulkState.authCalls).toHaveLength(4);
  });

  it('checks name-restricted Pods individually after a namespace denial', async () => {
    bulkState.allowEvict = (namespace, name) => namespace === 'ns-mixed' && name === 'pod-1';
    renderButton([
      makePod({ name: 'pod-1', namespace: 'ns-mixed' }),
      makePod({ name: 'pod-2', namespace: 'ns-mixed' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-2']));
    expect(bulkState.evictCalls).toEqual(['pod-1']);

    const namespaceChecks = bulkState.authCalls.filter(call => call.name === undefined);
    const podChecks = bulkState.authCalls.filter(call => call.name !== undefined);
    expect(namespaceChecks).toHaveLength(1);
    expect(podChecks.map(call => call.name).sort()).toEqual(['pod-1', 'pod-2']);
  });

  it('skips pods when the eviction authorization check fails and reports an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bulkState.failAuth = () => true;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    // We do not know whether eviction was allowed, so the Pod is left alone rather
    // than deleted, and the failure is reported.
    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Pods skipped because their eviction permission could not be verified: ns-1/pod-1.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.evictCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    // A failed namespace check is not repeated per Pod.
    expect(bulkState.authCalls).toHaveLength(1);
  });

  it('skips pods when the authorization result could not be evaluated', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A 200 response whose evaluation failed is not an explicit denial.
    bulkState.evaluationError = () => true;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Pods skipped because their eviction permission could not be verified: ns-1/pod-1.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.evictCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('skips pods when the authorization response has no verdict', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A 200 response with an empty status is not an explicit denial: it says nothing
    // about whether eviction is allowed, so the Pod must not be deleted in its place.
    bulkState.emptyStatus = () => true;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Pods skipped because their eviction permission could not be verified: ns-1/pod-1.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.evictCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    // An unevaluable namespace check is not a denial, so it is not repeated per Pod.
    expect(bulkState.authCalls).toHaveLength(1);
  });

  it('skips pods when an allowed verdict came with a failed evaluation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // An `allowed` value alongside an evaluation error cannot be trusted, so it is
    // not treated as a grant.
    bulkState.allowWithEvaluationError = () => true;
    const pod = makePod({ name: 'pod-1', namespace: 'ns-1' });
    renderButton([pod]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Pods skipped because their eviction permission could not be verified: ns-1/pod-1.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.evictCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('skips a Pod whose named eviction check has no verdict', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The namespace-wide check is denied, so each Pod is asked by name. An
    // unevaluable named answer must not become a delete fallback.
    bulkState.allowEvict = (namespace, name) => name === 'pod-2';
    bulkState.emptyStatus = (namespace, name) => name === 'pod-1';
    renderButton([
      makePod({ name: 'pod-1', namespace: 'ns-1' }),
      makePod({ name: 'pod-2', namespace: 'ns-1' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Pods skipped because their eviction permission could not be verified: ns-1/pod-1.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    expect(bulkState.evictCalls).toEqual(['pod-2']);
    expect(consoleError).toHaveBeenCalled();
    // One namespace-wide check, then one named check per Pod.
    expect(bulkState.authCalls).toHaveLength(3);
  });

  it('names only the pods that were deleted instead of evicted', async () => {
    // The namespace-wide check is denied; only pod-a may be evicted.
    bulkState.allowEvict = (namespace, name) => name === 'pod-a';
    renderButton([
      makePod({ name: 'pod-a', namespace: 'ns-1', cluster: 'cluster-a' }),
      makePod({ name: 'pod-b', namespace: 'ns-1', cluster: 'cluster-b' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.deleteCalls).toEqual(['pod-b']));
    expect(bulkState.evictCalls).toEqual(['pod-a']);
    // Only the fallback Pod is named, with its cluster so it can be identified.
    expect(bulkState.actionOptions.successMessage).toBe(
      'Deleted 2 items. Pods deleted instead of evicted because eviction is not permitted: ' +
        'cluster-b/ns-1/pod-b.'
    );
    // The whole batch is still one cancellable action.
    expect(bulkState.actionCalls).toBe(1);
  });

  it('still names the fallback pods when another item fails to delete', async () => {
    bulkState.allowEvict = () => false;
    bulkState.failDelete = name => name === 'pod-fail';
    renderButton([
      makePod({ name: 'pod-fail', namespace: 'ns-2' }),
      makePod({ name: 'pod-fallback', namespace: 'ns-1' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    // The failure must not hide the fact that a Pod bypassed its PodDisruptionBudget.
    await expect(bulkState.actionResult).rejects.toThrow(
      'failed to delete pod-fail. Pods deleted instead of evicted because eviction is not ' +
        'permitted: ns-1/pod-fallback.'
    );
    expect(bulkState.deleteCalls).toEqual(['pod-fallback']);
  });

  it('skips only the pod whose named eviction check fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The namespace-wide check is denied; the named checks are what decides.
    bulkState.allowEvict = (namespace, name) => namespace === 'ns-mixed' && name === 'pod-1';
    bulkState.failAuth = (namespace, name) => namespace === 'ns-mixed' && name === 'pod-2';
    renderButton([
      makePod({ name: 'pod-1', namespace: 'ns-mixed' }),
      makePod({ name: 'pod-2', namespace: 'ns-mixed' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow('ns-mixed/pod-2');
    expect(bulkState.evictCalls).toEqual(['pod-1']);
    expect(bulkState.deleteCalls).toEqual([]);
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

  it('skips only the pods in the namespace whose authorization check fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bulkState.failAuth = namespace => namespace === 'ns-error';
    renderButton([
      makePod({ name: 'pod-error', namespace: 'ns-error' }),
      makePod({ name: 'pod-ok', namespace: 'ns-ok' }),
    ]);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByTestId('confirm-button'));

    await waitFor(() => expect(bulkState.actionOptions).toBeDefined());
    await expect(bulkState.actionResult).rejects.toThrow(
      'Deleted 1 items. Pods skipped because their eviction permission could not be verified: ' +
        'ns-error/pod-error.'
    );
    expect(bulkState.deleteCalls).toEqual([]);
    // The rest of the batch still runs.
    expect(bulkState.evictCalls).toEqual(['pod-ok']);
    expect(consoleError).toHaveBeenCalled();
  });
});
