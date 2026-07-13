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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

// Hoist the MockKubeObject before any imports so vi.mock can use it
const { MockKubeObject, mockClusterAction } = vi.hoisted(() => {
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
      return this.jsonData?.kind;
    }
    get cluster() {
      return '';
    }
  }
  // eslint-disable-next-line no-unused-vars
  const mockClusterAction = vi.fn((..._args: any[]) => ({ type: 'clusterAction/mock' }));
  return { MockKubeObject, mockClusterAction };
});

vi.mock('../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../lib/k8s/namespace', () => ({
  __esModule: true,
  default: MockKubeObject,
}));

vi.mock('../../redux/clusterActionSlice', async () => {
  const actual = await vi.importActual('../../redux/clusterActionSlice');
  return {
    ...actual,
    clusterAction: mockClusterAction,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (options?.projectName) {
        return key.replace('{{projectName}}', options.projectName);
      }
      return key;
    },
  }),
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));

import { TestContext } from '../../test';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';
import { PROJECT_ID_LABEL } from './projectUtils';

describe('ProjectDeleteDialog', () => {
  const mockOnClose = vi.fn();
  const mockProject = {
    id: 'test-project',
    namespaces: ['ns1', 'ns2'],
  } as any;

  const makeMockNamespaces = () =>
    [
      {
        metadata: { name: 'ns1' },
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        jsonData: { metadata: { name: 'ns1', labels: { [PROJECT_ID_LABEL]: 'test-project' } } },
      },
      {
        metadata: { name: 'ns2' },
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        jsonData: { metadata: { name: 'ns2', labels: { [PROJECT_ID_LABEL]: 'test-project' } } },
      },
    ] as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClusterAction.mockReturnValue({ type: 'clusterAction/mock' });
  });

  test('renders dialog with project name and namespace list', () => {
    render(
      <TestContext>
        <ProjectDeleteDialog
          open
          project={mockProject}
          onClose={mockOnClose}
          namespaces={makeMockNamespaces()}
        />
      </TestContext>
    );

    expect(screen.getByText(/Are you sure you want to delete project/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(mockProject.id, 'i'))).toBeInTheDocument();
    // In test environment, translation might not interpolate, so we check for both or just the start
    expect(screen.getByText('ns1')).toBeInTheDocument();
    expect(screen.getByText('ns2')).toBeInTheDocument();
  });

  test('calls onClose when Cancel button is clicked', () => {
    render(
      <TestContext>
        <ProjectDeleteDialog
          open
          project={mockProject}
          onClose={mockOnClose}
          namespaces={makeMockNamespaces()}
        />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('calls clusterAction (label removal) when Delete Project is clicked', async () => {
    let capturedActionFn: (() => Promise<void>) | null = null;
    // eslint-disable-next-line no-unused-vars
    mockClusterAction.mockImplementation((actionFn: () => Promise<void>, ..._args: any[]) => {
      capturedActionFn = actionFn;
      return { type: 'clusterAction/mock' };
    });

    const namespaces = makeMockNamespaces();
    render(
      <TestContext>
        <ProjectDeleteDialog
          open
          project={mockProject}
          onClose={mockOnClose}
          namespaces={namespaces}
        />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Project' }));

    expect(mockClusterAction).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();

    // Invoke the async action captured by clusterAction mock
    if (capturedActionFn) {
      await (capturedActionFn as () => Promise<void>)();
    }

    // Should update labels, NOT delete either namespace
    expect(namespaces[0].update).toHaveBeenCalledWith({
      metadata: { name: 'ns1' },
    });
    expect(namespaces[1].update).toHaveBeenCalledWith({
      metadata: { name: 'ns2' },
    });
    expect(namespaces[0].delete).not.toHaveBeenCalled();
    expect(namespaces[1].delete).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('calls clusterAction (namespace delete) when checkbox is checked and confirmed', async () => {
    let capturedActionFn: (() => Promise<void>) | null = null;
    // eslint-disable-next-line no-unused-vars
    mockClusterAction.mockImplementation((actionFn: () => Promise<void>, ..._args: any[]) => {
      capturedActionFn = actionFn;
      return { type: 'clusterAction/mock' };
    });

    const namespaces = makeMockNamespaces();
    render(
      <TestContext>
        <ProjectDeleteDialog
          open
          project={mockProject}
          onClose={mockOnClose}
          namespaces={namespaces}
        />
      </TestContext>
    );

    // Check the "Also delete namespaces" checkbox
    fireEvent.click(screen.getByRole('checkbox', { name: /also delete the namespaces/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Project & Namespaces' }));

    expect(mockClusterAction).toHaveBeenCalled();

    if (capturedActionFn) {
      await (capturedActionFn as () => Promise<void>)();
    }

    // Should delete the namespaces entirely
    expect(namespaces[0].delete).toHaveBeenCalled();
    expect(namespaces[1].delete).toHaveBeenCalled();
    expect(namespaces[0].update).not.toHaveBeenCalled();
    expect(namespaces[1].update).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('shows irreversible warning when namespace deletion checkbox is checked', () => {
    render(
      <TestContext>
        <ProjectDeleteDialog
          open
          project={mockProject}
          onClose={mockOnClose}
          namespaces={makeMockNamespaces()}
        />
      </TestContext>
    );

    expect(screen.queryByText(/This action cannot be undone/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /also delete the namespaces/i }));

    expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument();
  });
});
