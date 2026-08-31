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

const { MockKubeObject, mockApply, mockHistoryPush, mockUseTypedSelector } = vi.hoisted(() => {
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
  const mockUseTypedSelector = vi.fn().mockReturnValue({});
  return { MockKubeObject, mockApply, mockHistoryPush, mockUseTypedSelector };
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
  useTypedSelector: mockUseTypedSelector,
}));
vi.mock('@iconify/react', () => ({
  Icon: () => <span />,
}));

import { EventStatus, HeadlampEventType } from '../../redux/headlampEventSlice';
import { recordHeadlampEvents, TestContext } from '../../test';
import { NewProjectPopup } from './NewProjectPopup';
import { PROJECT_ID_LABEL } from './projectUtils';

describe('NewProjectPopup', () => {
  const mockOnClose = vi.fn();

  /** Fills in the create form with a valid project and returns the enabled Create button. */
  async function fillCreateForm(projectName: string, namespace: string) {
    fireEvent.click(screen.getByText('New Project'));
    fireEvent.change(screen.getByLabelText(/Project Name/i), { target: { value: projectName } });

    const clusterInput = screen.getByLabelText('Clusters');
    fireEvent.mouseDown(clusterInput);
    fireEvent.click(screen.getByText('cluster-1'));

    const nsInput = screen.getByLabelText('Namespace');
    fireEvent.change(nsInput, { target: { value: namespace } });
    fireEvent.keyDown(nsInput, { key: 'Enter' });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn).not.toBeDisabled());
    return createBtn;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTypedSelector.mockReturnValue({});
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

  test('normalizes the project name when the field loses focus', () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));
    const projectNameInput = screen.getByLabelText(/Project Name/i);
    fireEvent.change(projectNameInput, { target: { value: 'My Project!' } });
    fireEvent.blur(projectNameInput);

    expect(projectNameInput).toHaveValue('my-project');
  });

  test('assigns an existing namespace without creating it again', async () => {
    const existingNamespace = {
      cluster: 'cluster-1',
      metadata: { name: 'existing-ns', labels: {} },
      patch: vi.fn().mockResolvedValue({}),
    };
    (MockKubeObject.useList as any).mockReturnValue({
      items: [existingNamespace],
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
      target: { value: 'existing-namespace-project' },
    });
    fireEvent.mouseDown(screen.getByLabelText('Clusters'));
    fireEvent.click(screen.getByText('cluster-1'));
    fireEvent.mouseDown(screen.getByLabelText('Namespace'));
    fireEvent.click(screen.getByText('existing-ns'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(existingNamespace.patch).toHaveBeenCalledWith({
        metadata: { labels: { [PROJECT_ID_LABEL]: 'existing-namespace-project' } },
      });
    });
    expect(mockApply).not.toHaveBeenCalled();
  });

  test('creates a namespace when namespace list data is unavailable', async () => {
    (MockKubeObject.useList as any).mockReturnValue({
      items: undefined,
      errors: [],
      isLoading: true,
    });

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    const createBtn = await fillCreateForm('new-project', 'new-ns');
    fireEvent.click(createBtn);

    await waitFor(() => expect(mockApply).toHaveBeenCalled());
  });

  test('opens a custom project creator', () => {
    const CustomProject = ({ onBack }: { onBack: () => void }) => (
      <button onClick={onBack}>Custom project content</button>
    );
    mockUseTypedSelector.mockReturnValue({
      custom: {
        id: 'custom',
        name: 'Custom project',
        description: 'Create a custom project',
        icon: () => <span>Custom icon</span>,
        component: CustomProject,
      },
      customWithStringIcon: {
        id: 'custom-with-string-icon',
        name: 'String icon project',
        description: 'Create a project with a named icon',
        icon: 'mdi:folder-star',
        component: CustomProject,
      },
    });

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    expect(screen.getByText('Custom icon')).toBeInTheDocument();
    expect(screen.getByText('String icon project')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Custom project'));
    fireEvent.click(screen.getByText('Custom project content'));

    expect(screen.getByText('Create a Project')).toBeInTheDocument();
  });

  test('successfully creates a new project', async () => {
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    const createBtn = await fillCreateForm('new-project', 'new-ns');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockApply).toHaveBeenCalled();
      expect(mockHistoryPush).toHaveBeenCalledWith(expect.stringContaining('new-project'));
    });
  });

  test('dispatches CREATE_PROJECT when the user confirms creation', async () => {
    const events = recordHeadlampEvents();

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    const createBtn = await fillCreateForm('new-project', 'new-ns');
    fireEvent.click(createBtn);

    await waitFor(() => expect(mockApply).toHaveBeenCalled());

    expect(events.filter(e => e.type === HeadlampEventType.CREATE_PROJECT)).toEqual([
      {
        type: HeadlampEventType.CREATE_PROJECT,
        data: {
          project: {
            id: 'new-project',
            namespaces: ['new-ns'],
            clusters: ['cluster-1'],
          },
          status: EventStatus.CONFIRMED,
        },
      },
    ]);
  });

  test('dispatches CREATE_PROJECT even when the namespace creation fails', async () => {
    mockApply.mockRejectedValueOnce(new Error('nope'));
    const events = recordHeadlampEvents();

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    const createBtn = await fillCreateForm('failing-project', 'failing-ns');
    fireEvent.click(createBtn);

    await waitFor(() => expect(mockApply).toHaveBeenCalled());

    expect(events.filter(e => e.type === HeadlampEventType.CREATE_PROJECT)).toEqual([
      {
        type: HeadlampEventType.CREATE_PROJECT,
        data: {
          project: {
            id: 'failing-project',
            namespaces: ['failing-ns'],
            clusters: ['cluster-1'],
          },
          status: EventStatus.CONFIRMED,
        },
      },
    ]);
    expect(mockHistoryPush).not.toHaveBeenCalled();
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
