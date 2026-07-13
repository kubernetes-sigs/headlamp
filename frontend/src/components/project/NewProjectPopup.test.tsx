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
import React from 'react';
import { vi } from 'vitest';

const { MockKubeObject, mockApply, mockHistoryPush } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    static kind = '';
    constructor(data: any) {
      this.jsonData = data;
    }
    get metadata() {
      return this.jsonData?.metadata;
    }
    patch = vi.fn().mockResolvedValue({});
    static useList = vi.fn().mockReturnValue({ items: [], errors: [], isLoading: false });
    static isValidNamespaceFormat = vi.fn().mockReturnValue(true);
  }
  const mockApply = vi.fn().mockResolvedValue({});
  const mockHistoryPush = vi.fn();
  return { MockKubeObject, mockApply, mockHistoryPush };
});

vi.mock('../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../lib/k8s/namespace', () => ({
  __esModule: true,
  default: MockKubeObject,
}));
vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: mockApply }));
vi.mock('../../lib/k8s', () => ({
  useClustersConf: vi.fn().mockReturnValue({ 'cluster-1': { name: 'cluster-1' } }),
}));
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...(actual as any),
    useHistory: () => ({
      push: mockHistoryPush,
    }),
  };
});
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual('react-i18next');
  return {
    ...(actual as any),
    useTranslation: () => ({
      t: (key: string, options?: any) => {
        if (options?.projectName) {
          return key.replace('{{projectName}}', options.projectName);
        }
        return key;
      },
    }),
    Trans: ({ children }: any) => children,
  };
});
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: vi.fn().mockReturnValue({}),
}));
vi.mock('@iconify/react', () => ({
  Icon: () => <span />,
}));

import { TestContext } from '../../test';
import { NewProjectPopup } from './NewProjectPopup';
import { PROJECT_ID_LABEL } from './projectUtils';

describe('NewProjectPopup', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (MockKubeObject.useList as any).mockReturnValue({ items: [], errors: [], isLoading: false });
  });

  test('renders selection dialog when open', () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    expect(screen.getByText('Create a Project')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('New Project from YAML')).toBeInTheDocument();
  });

  test('navigates to New Project step when clicked', () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));
    expect(screen.getByText('Create new project')).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Name/i)).toBeInTheDocument();
  });

  test('validates project name and cluster selection', async () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));

    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();

    // Fill project name
    fireEvent.change(screen.getByLabelText(/Project Name/i), { target: { value: 'my-project' } });

    // Fill cluster (it's an Autocomplete)
    const clusterInput = screen.getByLabelText('Clusters');
    fireEvent.mouseDown(clusterInput);
    fireEvent.click(screen.getByText('cluster-1'));

    // Fill namespace (freeSolo Autocomplete)
    const nsInput = screen.getByLabelText('Namespace');
    fireEvent.change(nsInput, { target: { value: 'my-ns' } });
    fireEvent.keyDown(nsInput, { key: 'Enter' });

    await waitFor(() => {
      expect(createBtn).not.toBeDisabled();
    });
  });

  test('shows error when project name already exists', async () => {
    (MockKubeObject.useList as any).mockReturnValue({
      items: [
        {
          metadata: {
            name: 'existing-ns',
            labels: { [PROJECT_ID_LABEL]: 'existing-project' },
          },
        },
      ],
      errors: [],
      isLoading: false,
    });

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));

    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'existing-project' },
    });

    expect(screen.getByText('A project with this name already exists')).toBeInTheDocument();
  });

  test('successfully creates a new project', async () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));

    fireEvent.change(screen.getByLabelText(/Project Name/i), { target: { value: 'new-project' } });

    const clusterInput = screen.getByLabelText('Clusters');
    fireEvent.mouseDown(clusterInput);
    fireEvent.click(screen.getByText('cluster-1'));

    const nsInput = screen.getByLabelText('Namespace');
    fireEvent.change(nsInput, { target: { value: 'new-ns' } });
    fireEvent.keyDown(nsInput, { key: 'Enter' });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn).not.toBeDisabled());

    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockApply).toHaveBeenCalled();
      expect(mockHistoryPush).toHaveBeenCalledWith(expect.stringContaining('new-project'));
    });
  });

  test('navigates back to selection from New Project step', () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Create a Project')).toBeInTheDocument();
  });

  test('navigates to YAML creation when clicked', () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project from YAML'));
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockHistoryPush).toHaveBeenCalledWith(expect.stringContaining('create-yaml'));
  });
});
