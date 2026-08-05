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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseList } = vi.hoisted(() => ({
  mockUseList: vi.fn(),
}));

vi.mock('../../lib/k8s/namespace', () => ({
  __esModule: true,
  default: {
    useList: mockUseList,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../common/ActionButton', () => ({
  __esModule: true,
  default: ({ description, onClick }: { description: string; onClick: () => void }) => (
    <button onClick={onClick}>{description}</button>
  ),
}));

vi.mock('./ProjectDeleteDialog', () => ({
  ProjectDeleteDialog: ({
    open,
    canDeleteNamespaces,
  }: {
    open: boolean;
    canDeleteNamespaces: boolean;
  }) =>
    open ? (
      <div data-testid="delete-dialog" data-can-delete-namespaces={canDeleteNamespaces} />
    ) : null,
}));

import { ProjectDeleteButton } from './ProjectDeleteButton';

type NamespacePermissions = {
  update: boolean;
  delete: boolean;
};

function makeNamespace(name: string, permissions: NamespacePermissions, cluster = 'cluster-a') {
  return {
    cluster,
    metadata: { name },
    getAuthorization: vi.fn((verb: keyof NamespacePermissions) =>
      Promise.resolve({
        status: {
          allowed: permissions[verb],
        },
      })
    ),
  };
}

function renderButton(namespaces: ReturnType<typeof makeNamespace>[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  mockUseList.mockReturnValue([namespaces]);

  render(
    <QueryClientProvider client={queryClient}>
      <ProjectDeleteButton
        project={{
          id: 'test-project',
          namespaces: namespaces.map(namespace => namespace.metadata.name),
          clusters: ['cluster-a'],
        }}
      />
    </QueryClientProvider>
  );
}

describe('ProjectDeleteButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the action when every namespace can be updated', async () => {
    const namespaces = [
      makeNamespace('ns1', { update: true, delete: true }),
      makeNamespace('ns2', { update: true, delete: true }),
    ];

    renderButton(namespaces);

    expect(await screen.findByRole('button', { name: 'Delete project' })).toBeInTheDocument();
    expect(namespaces[0].getAuthorization).toHaveBeenCalledWith('update');
    expect(namespaces[1].getAuthorization).toHaveBeenCalledWith('update');
  });

  it('hides the action when any namespace cannot be updated', async () => {
    const namespaces = [
      makeNamespace('ns1', { update: true, delete: true }),
      makeNamespace('ns2', { update: false, delete: true }),
    ];

    renderButton(namespaces);

    await waitFor(() => {
      expect(namespaces[0].getAuthorization).toHaveBeenCalledWith('update');
      expect(namespaces[1].getAuthorization).toHaveBeenCalledWith('update');
    });

    expect(namespaces[0].getAuthorization).not.toHaveBeenCalledWith('delete');
    expect(namespaces[1].getAuthorization).not.toHaveBeenCalledWith('delete');
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
  });

  it('hides the action while update authorization is loading', async () => {
    let resolveAuthorization: (value: { status: { allowed: boolean } }) => void = () => {};
    const pendingAuthorization = new Promise<{ status: { allowed: boolean } }>(resolve => {
      resolveAuthorization = resolve;
    });
    const namespace = makeNamespace('ns1', { update: true, delete: true });
    namespace.getAuthorization.mockImplementation(verb =>
      verb === 'update'
        ? pendingAuthorization
        : Promise.resolve({
            status: {
              allowed: true,
            },
          })
    );

    renderButton([namespace]);

    await waitFor(() => {
      expect(namespace.getAuthorization).toHaveBeenCalledWith('update');
    });
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();

    await act(async () => {
      resolveAuthorization({ status: { allowed: true } });
    });
    expect(await screen.findByRole('button', { name: 'Delete project' })).toBeInTheDocument();
  });

  it('hides the action when an update authorization check fails', async () => {
    const namespace = makeNamespace('ns1', { update: true, delete: true });
    namespace.getAuthorization.mockImplementation(verb =>
      verb === 'update'
        ? Promise.reject(new Error('Authorization check failed'))
        : Promise.resolve({
            status: {
              allowed: true,
            },
          })
    );

    renderButton([namespace]);

    await waitFor(() => {
      expect(namespace.getAuthorization).toHaveBeenCalledWith('update');
    });
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
  });

  it('only enables namespace deletion when every namespace can be deleted', async () => {
    const namespaces = [
      makeNamespace('ns1', { update: true, delete: true }),
      makeNamespace('ns2', { update: true, delete: false }),
    ];

    renderButton(namespaces);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));

    expect(screen.getByTestId('delete-dialog')).toHaveAttribute(
      'data-can-delete-namespaces',
      'false'
    );
  });

  it('checks delete authorization after the dialog is opened', async () => {
    const namespaces = [
      makeNamespace('ns1', { update: true, delete: true }),
      makeNamespace('ns2', { update: true, delete: true }),
    ];

    renderButton(namespaces);

    const deleteButton = await screen.findByRole('button', { name: 'Delete project' });

    expect(namespaces[0].getAuthorization).not.toHaveBeenCalledWith('delete');
    expect(namespaces[1].getAuthorization).not.toHaveBeenCalledWith('delete');

    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(namespaces[0].getAuthorization).toHaveBeenCalledWith('delete');
      expect(namespaces[1].getAuthorization).toHaveBeenCalledWith('delete');
      expect(screen.getByTestId('delete-dialog')).toHaveAttribute(
        'data-can-delete-namespaces',
        'true'
      );
    });
  });

  it('keeps namespace deletion disabled when a delete authorization check fails', async () => {
    const namespace = makeNamespace('ns1', { update: true, delete: true });
    namespace.getAuthorization.mockImplementation(verb =>
      verb === 'delete'
        ? Promise.reject(new Error('Authorization check failed'))
        : Promise.resolve({
            status: {
              allowed: true,
            },
          })
    );

    renderButton([namespace]);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete project' }));

    await waitFor(() => {
      expect(namespace.getAuthorization).toHaveBeenCalledWith('delete');
    });
    expect(screen.getByTestId('delete-dialog')).toHaveAttribute(
      'data-can-delete-namespaces',
      'false'
    );
  });
});
