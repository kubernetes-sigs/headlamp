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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import store from '../../../redux/stores/store';
import { TestContext } from '../../../test';
import EditButton from './EditButton';

const mockEnqueueSnackbar = vi.fn();
const mockDispatchEvent = vi.fn();
const mockFetchLatestKubeObject = vi.fn();
const mockActivityClose = vi.fn();
const mockActivityLaunch = vi.fn();
const mockActivityUpdate = vi.fn();

let authProps: any = {};
let mockWatchedItem: any = null;

vi.mock('notistack', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

vi.mock('../../../redux/headlampEventSlice', async () => {
  const actual = (await vi.importActual('../../../redux/headlampEventSlice')) as Record<
    string,
    any
  >;
  return {
    ...actual,
    useEventCallback: () => mockDispatchEvent,
  };
});

vi.mock('../../../redux/clusterActionSlice', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    clusterAction: (fn: () => Promise<void>, opts: any) => ({ type: 'CLUSTER_ACTION', fn, opts }),
  };
});

vi.mock('../../activity/Activity', () => ({
  Activity: {
    close: (...args: any[]) => mockActivityClose(...args),
    launch: (...args: any[]) => mockActivityLaunch(...args),
    update: (...args: any[]) => mockActivityUpdate(...args),
  },
}));

vi.mock('./AuthVisible', () => ({
  default: (props: any) => {
    authProps = props;
    return <div data-testid="auth-visible">{props.children}</div>;
  },
}));

vi.mock('./ViewButton', () => ({
  default: ({ item }: any) => <button data-testid="view-button">View {item.metadata.name}</button>,
}));

vi.mock('./EditorDialog', () => ({
  default: (props: any) => {
    return (
      <div data-testid="editor-dialog">
        <span data-testid="editor-rv">{props.item?.metadata?.resourceVersion}</span>
        {props.errorMessage && <span data-testid="editor-error">{props.errorMessage}</span>}
        <button
          data-testid="editor-save"
          onClick={() => props.onSave([{ ...props.item, saved: true }])}
        >
          Save
        </button>
        <button
          data-testid="editor-save-single"
          onClick={() => props.onSave({ ...props.item, savedSingle: true })}
        >
          SaveSingle
        </button>
        <button data-testid="editor-close" onClick={() => props.onClose()}>
          Close
        </button>
        <button data-testid="editor-change" onClick={() => props.onEditorChanged()}>
          Change
        </button>
        <button
          data-testid="editor-rebase"
          onClick={() =>
            props.onBaselineAccepted({
              ...props.item,
              metadata: { ...props.item.metadata, resourceVersion: '99' },
            })
          }
        >
          Rebase
        </button>
      </div>
    );
  },
}));

vi.mock('./fetchLatestKubeObject', () => ({
  fetchLatestKubeObject: (...args: any[]) => mockFetchLatestKubeObject(...args),
}));

const compactSecretItem = {
  kind: 'Secret',
  cluster: 'test-cluster',
  metadata: { name: 'example', namespace: 'default', uid: 'secret-uid' },
  jsonData: { data: {}, dataCount: 2 },
} as unknown as KubeObject;

describe('EditButton compact Secrets', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each([401, 403, 500])(
    'does not edit a partial Secret when fetching fails with %i',
    async status => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchLatestKubeObject.mockRejectedValue({ status });
      render(
        <TestContext>
          <EditButton item={compactSecretItem} />
        </TestContext>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() =>
        expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'error' })
      );
      expect(mockActivityLaunch).not.toHaveBeenCalled();
      expect(mockDispatchEvent).not.toHaveBeenCalled();
    }
  );

  it('opens the full Secret after a successful refresh', async () => {
    const latest = { ...compactSecretItem, jsonData: { data: { token: 'YQ==' } } } as KubeObject;
    mockFetchLatestKubeObject.mockResolvedValue(latest);
    render(
      <TestContext>
        <EditButton item={compactSecretItem} />
      </TestContext>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalled());
    expect(mockActivityLaunch.mock.calls[0][0].content.props.item).toBe(latest);
  });

  it('keeps the authorization fallback for an ordinary full resource', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const full = { ...compactSecretItem, jsonData: { data: { token: 'YQ==' } } } as KubeObject;
    mockFetchLatestKubeObject.mockRejectedValue({ status: 403 });
    render(
      <TestContext>
        <EditButton item={full} />
      </TestContext>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalled());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'warning' });
  });
});

function makeItem(resourceVersion = '10', extra: Record<string, any> = {}) {
  const patchUpdate = vi.fn().mockResolvedValue({});
  class FakeKubeObject {
    kind = 'ConfigMap';
    cluster = 'minikube';
    metadata = {
      uid: 'uid-cm-1',
      name: 'my-cm',
      namespace: 'default',
      resourceVersion,
    };
    patchUpdate = patchUpdate;
    static useGet() {
      return [mockWatchedItem];
    }
    getEditableObject() {
      return {
        kind: this.kind,
        metadata: { ...this.metadata },
        ...extra,
      };
    }
  }
  return new FakeKubeObject() as any;
}

describe('EditButton', () => {
  let mockDispatch: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchedItem = null;
    authProps = {};
    mockDispatch = vi.spyOn(store, 'dispatch').mockImplementation((action: any) => action);
  });

  afterEach(() => {
    mockDispatch.mockRestore();
    consoleSpy?.mockRestore();
    consoleSpy = undefined;
  });

  it('switches to ViewButton when unauthorized or on auth error', () => {
    const item = makeItem();
    render(
      <TestContext>
        <EditButton item={item} />
      </TestContext>
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    // Simulate unauthorized
    act(() => {
      authProps.onAuthResult({ allowed: false });
    });
    expect(screen.getByTestId('view-button')).toBeInTheDocument();

    // Re-render and simulate auth error
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TestContext>
        <EditButton item={item} />
      </TestContext>
    );
    act(() => {
      authProps.onError(new Error('auth failed'));
    });
    expect(consoleSpy).toHaveBeenCalled();
    expect(screen.getAllByTestId('view-button')).toHaveLength(2);
  });

  it('fetches latest object and launches editor activity on click', async () => {
    const item = makeItem('10');
    const latestItem = makeItem('12');
    const afterConfirm = vi.fn();
    mockFetchLatestKubeObject.mockResolvedValue(latestItem);

    render(
      <TestContext>
        <EditButton item={item} afterConfirm={afterConfirm} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    });

    expect(afterConfirm).toHaveBeenCalledTimes(1);
    expect(mockActivityClose).toHaveBeenCalledWith('edit-uid-cm-1');
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resource: latestItem })
    );

    // Render the launched activity content
    const launchArg = mockActivityLaunch.mock.calls[0][0];
    render(<TestContext>{launchArg.content}</TestContext>);
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('editor-rv')).toHaveTextContent('12');

    // Close editor
    mockActivityClose.mockClear();
    fireEvent.click(screen.getByTestId('editor-close'));
    expect(mockActivityClose).toHaveBeenCalledWith('edit-uid-cm-1');
  });

  it('handles 401/403 with warning and falls back to item, and blocks on 409/500/unknown errors', async () => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const item = makeItem('10');

    render(
      <TestContext>
        <EditButton item={item} />
      </TestContext>
    );

    // 403 -> warning snackbar + launches activity with original item
    mockFetchLatestKubeObject.mockRejectedValueOnce({ status: 403 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'warning' });
    });
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);

    // 409 -> error snackbar, no activity launch
    mockFetchLatestKubeObject.mockRejectedValueOnce({ status: 409 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.stringContaining('modified by another process'),
        { variant: 'error' }
      );
    });
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);

    // 500 -> error snackbar with status code
    mockFetchLatestKubeObject.mockRejectedValueOnce({ status: 500 });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('500'), {
        variant: 'error',
      });
    });

    // Generic error without message -> unknown error fallback
    mockFetchLatestKubeObject.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('unknown error'), {
        variant: 'error',
      });
    });
  });

  it('handles save, patchUpdate failure, error clearing, and baseline rebase in EditorActivityContent', async () => {
    const item = makeItem('10');
    const afterConfirm = vi.fn();
    mockFetchLatestKubeObject.mockResolvedValue(item);

    render(
      <TestContext>
        <EditButton item={item} afterConfirm={afterConfirm} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));

    const launchArg = mockActivityLaunch.mock.calls[0][0];
    render(<TestContext>{launchArg.content}</TestContext>);

    // Successful save
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(mockActivityUpdate).toHaveBeenCalledWith('edit-uid-cm-1', { minimized: true });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const action = mockDispatch.mock.calls[0][0];
    mockActivityClose.mockClear();
    await action.fn();
    expect(item.patchUpdate).toHaveBeenCalledTimes(1);
    expect(item.patchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ resourceVersion: '10' }) }),
      expect.objectContaining({ saved: true })
    );
    expect(mockActivityClose).toHaveBeenCalledWith('edit-uid-cm-1');
    expect(afterConfirm).toHaveBeenCalledTimes(2);

    // Rebase baseline and save single item
    fireEvent.click(screen.getByTestId('editor-rebase'));
    fireEvent.click(screen.getByTestId('editor-save-single'));
    const action2 = mockDispatch.mock.calls[1][0];
    await action2.fn();
    expect(item.patchUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ resourceVersion: '99' }) }),
      expect.objectContaining({ savedSingle: true })
    );

    // Failed patchUpdate sets errorMessage and un-minimizes activity
    item.patchUpdate.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByTestId('editor-save'));
    const action3 = mockDispatch.mock.calls[2][0];
    await expect(action3.fn()).rejects.toThrow('boom');
    expect(mockActivityUpdate).toHaveBeenLastCalledWith('edit-uid-cm-1', { minimized: false });
    await waitFor(() => {
      expect(screen.getByTestId('editor-error')).toHaveTextContent('boom');
    });

    // Clear error on editor change
    fireEvent.click(screen.getByTestId('editor-change'));
    await waitFor(() => {
      expect(screen.queryByTestId('editor-error')).not.toBeInTheDocument();
    });
  });

  it('prefers fresher watchedItem and ignores stale numeric watchedItem', async () => {
    const item = makeItem('10');
    mockWatchedItem = makeItem('5'); // stale
    mockFetchLatestKubeObject.mockResolvedValue(item);

    render(
      <TestContext>
        <EditButton item={item} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));

    const launchArg = mockActivityLaunch.mock.calls[0][0];
    const { rerender } = render(<TestContext>{launchArg.content}</TestContext>);
    expect(screen.getByTestId('editor-rv')).toHaveTextContent('10');

    // Newer numeric version
    mockWatchedItem = makeItem('15');
    rerender(<TestContext>{launchArg.content}</TestContext>);
    expect(screen.getByTestId('editor-rv')).toHaveTextContent('15');

    // Non-numeric opaque version is trusted
    mockWatchedItem = makeItem('opaque-v2');
    rerender(<TestContext>{launchArg.content}</TestContext>);
    expect(screen.getByTestId('editor-rv')).toHaveTextContent('opaque-v2');
  });
});
