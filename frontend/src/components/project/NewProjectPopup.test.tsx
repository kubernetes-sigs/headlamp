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

// Registers the app's routes (via setDefaultRoutes) so createRouteURL below has routes to resolve.
import '../../lib/router';
import { useClustersConf } from '../../lib/k8s';
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
    (useClustersConf as any).mockReturnValue({ 'cluster-1': { name: 'cluster-1' } });
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

  /**
   * Stands in for the namespace watch: `Namespace.useList` reads from this store, and the
   * patch/apply mocks update it so the dialog re-renders with the labelled rows, as it would
   * when the watch delivers them from a real cluster.
   */
  function mockWatchedNamespaces(initial: any[]) {
    let items = initial;
    const listeners = new Set<() => void>();
    const store = {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => items,
      set: (next: any[]) => {
        act(() => {
          items = next;
          listeners.forEach(listener => listener());
        });
      },
      /** Replaces the row for (cluster, name) with the same row carrying the given labels. */
      label: (cluster: string, name: string, labels: Record<string, string>) => {
        store.set(
          items.map(ns =>
            ns.cluster === cluster && ns.metadata.name === name
              ? { ...ns, metadata: { ...ns.metadata, labels } }
              : ns
          )
        );
      },
    };
    (MockKubeObject.useList as any).mockImplementation(() => ({
      items: React.useSyncExternalStore(store.subscribe, store.getSnapshot),
      errors: [],
      isLoading: false,
    }));
    return store;
  }

  /** A namespace row whose patch labels it in the store, as the API server would. */
  function watchedNamespace(
    store: ReturnType<typeof mockWatchedNamespaces>,
    cluster: string,
    name: string,
    labels: Record<string, string> = {}
  ) {
    return {
      cluster,
      metadata: { name, labels },
      patch: vi.fn().mockImplementation(async (body: any) => {
        store.label(cluster, name, body.metadata.labels);
        return {};
      }),
    };
  }

  /**
   * Renders the dialog for two clusters and fills in a project using an existing namespace.
   * useClustersConf is read on every render, so the two clusters stay until beforeEach resets it.
   */
  async function fillProjectWithExistingNamespace(projectName: string, namespace: string) {
    (useClustersConf as any).mockReturnValue({
      'cluster-1': { name: 'cluster-1' },
      'cluster-2': { name: 'cluster-2' },
    });
    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );

    fireEvent.click(screen.getByText('New Project'));
    fireEvent.change(screen.getByLabelText(/Project Name/i), { target: { value: projectName } });
    fireEvent.mouseDown(screen.getByLabelText('Clusters'));
    fireEvent.click(screen.getByText('cluster-1'));
    fireEvent.mouseDown(screen.getByLabelText('Clusters'));
    fireEvent.click(screen.getByText('cluster-2'));
    fireEvent.mouseDown(screen.getByLabelText('Namespace'));
    fireEvent.click(screen.getByText(namespace));

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn).not.toBeDisabled());
    return createBtn;
  }

  test('does not report the project being created as existing', async () => {
    const store = mockWatchedNamespaces([]);
    const namespace = watchedNamespace(store, 'cluster-1', 'existing-ns');
    store.set([namespace]);
    let finishApply = () => {};
    mockApply.mockImplementationOnce(
      (obj: any, cluster: string) =>
        new Promise<void>(resolve => {
          finishApply = () => {
            store.set([...store.getSnapshot(), { cluster, metadata: obj.metadata }]);
            resolve();
          };
        })
    );

    fireEvent.click(await fillProjectWithExistingNamespace('brand-new-project', 'existing-ns'));

    // The namespace was patched and the watch now reports the new label, but the namespace
    // still has to be created in cluster-2, so the dialog is still in the creating state.
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(namespace.patch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Creating' })).toBeDisabled();

    expect(screen.queryByText('A project with this name already exists')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Namespace')).toHaveValue('existing-ns');

    finishApply();
    await waitFor(() =>
      expect(mockHistoryPush).toHaveBeenCalledWith(expect.stringContaining('brand-new-project'))
    );
  });

  test('lets the user retry after a creation that failed half way', async () => {
    const store = mockWatchedNamespaces([]);
    const namespace = watchedNamespace(store, 'cluster-1', 'existing-ns');
    store.set([namespace]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));

    // cluster-1 was labelled, cluster-2 failed: the dialog reports the error, not a conflict
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(screen.queryByText('A project with this name already exists')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Namespace')).toHaveValue('existing-ns');
    expect(mockHistoryPush).not.toHaveBeenCalled();

    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).not.toBeDisabled();
    let finishApply = () => {};
    mockApply.mockImplementationOnce(() => new Promise<void>(resolve => (finishApply = resolve)));
    fireEvent.click(createBtn);

    // The previous error is gone while the retry is running
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating' })).toBeDisabled());
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
    finishApply();

    await waitFor(() =>
      expect(mockHistoryPush).toHaveBeenCalledWith(expect.stringContaining('half-created-project'))
    );
    // The selection was kept and cluster-1 already carries the label: the retry only
    // had to create the namespace in cluster-2
    expect(namespace.patch).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(mockApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: 'existing-ns' }) }),
      'cluster-2'
    );
  });

  test('dispatches CREATE_PROJECT once even when the creation is retried', async () => {
    const events = recordHeadlampEvents();
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockHistoryPush).toHaveBeenCalled());

    expect(events.filter(e => e.type === HeadlampEventType.CREATE_PROJECT)).toHaveLength(1);
  });

  test('dispatches CREATE_PROJECT again when the clusters change between attempts', async () => {
    const events = recordHeadlampEvents();
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    (useClustersConf as any).mockReturnValue({
      'cluster-1': { name: 'cluster-1' },
      'cluster-2': { name: 'cluster-2' },
      'cluster-3': { name: 'cluster-3' },
    });
    // The dialog only picks up the new cluster list when it renders again
    const nameInput = screen.getByLabelText(/Project Name/i);
    fireEvent.change(nameInput, { target: { value: 'half-created-projec' } });
    fireEvent.change(nameInput, { target: { value: 'half-created-project' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Clusters' }), {
      target: { value: 'cluster-3' },
    });
    fireEvent.click(await screen.findByRole('option', { name: 'cluster-3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockHistoryPush).toHaveBeenCalled());

    const created = events.filter(e => e.type === HeadlampEventType.CREATE_PROJECT);
    expect(created).toHaveLength(2);
    expect((created[1].data as any).project.clusters).toEqual([
      'cluster-1',
      'cluster-2',
      'cluster-3',
    ]);
  });

  test('dispatches CREATE_PROJECT again when a cluster is removed between attempts', async () => {
    const events = recordHeadlampEvents();
    const store = mockWatchedNamespaces([]);
    const namespace = watchedNamespace(store, 'cluster-1', 'existing-ns');
    store.set([namespace]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    // Backspace in the empty cluster field removes the last selected cluster (cluster-2)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Clusters' }), { key: 'Backspace' });
    await waitFor(() => expect(screen.queryByText('cluster-2')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockHistoryPush).toHaveBeenCalled());

    // Fewer clusters is a different project definition, even though no new cluster was written
    const created = events.filter(e => e.type === HeadlampEventType.CREATE_PROJECT);
    expect(created).toHaveLength(2);
    expect((created[1].data as any).project.clusters).toEqual(['cluster-1']);
    // cluster-1 was labelled by the first attempt and is not written again; the only
    // creation was the failed one in cluster-2
    expect(namespace.patch).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: 'existing-ns' }) }),
      'cluster-2'
    );
  });

  test('reports the half-created project when a different namespace is chosen', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    // With another namespace this would be a second project with the same name
    const nsInput = screen.getByLabelText('Namespace');
    fireEvent.change(nsInput, { target: { value: 'other-ns' } });
    fireEvent.keyDown(nsInput, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByText('A project with this name already exists')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('stops hiding a cluster where its own write failed', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    // Someone else created the project's namespace in cluster-2, where our write failed
    store.set([
      ...store.getSnapshot(),
      watchedNamespace(store, 'cluster-2', 'existing-ns', {
        [PROJECT_ID_LABEL]: 'half-created-project',
      }),
    ]);

    await waitFor(() =>
      expect(screen.getByText('A project with this name already exists')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('still reports a project that exists with the same namespace in another cluster', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([
      watchedNamespace(store, 'cluster-1', 'existing-ns'),
      watchedNamespace(store, 'cluster-2', 'existing-ns', { [PROJECT_ID_LABEL]: 'taken-project' }),
    ]);

    render(
      <TestContext>
        <NewProjectPopup open onClose={mockOnClose} />
      </TestContext>
    );
    fireEvent.click(screen.getByText('New Project'));
    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'taken-project' },
    });

    expect(screen.getByText('A project with this name already exists')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText('Namespace'));
    expect(screen.getByRole('option', { name: 'existing-ns' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('still reports a namespace another project took while creation was running', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    // Someone else assigned the namespace in cluster-2 to a different project meanwhile
    store.set([
      ...store.getSnapshot(),
      watchedNamespace(store, 'cluster-2', 'existing-ns', { [PROJECT_ID_LABEL]: 'other-project' }),
    ]);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled());
    expect(screen.queryByText('A project with this name already exists')).not.toBeInTheDocument();
  });

  test('validates against the live list again once the project name changes', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(screen.queryByText('A project with this name already exists')).not.toBeInTheDocument();

    // existing-ns now belongs to half-created-project in cluster-1, so it is no longer free
    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: 'another-project' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled());
  });

  test('keeps ignoring its own writes when the user returns to the same project name', async () => {
    const store = mockWatchedNamespaces([]);
    store.set([watchedNamespace(store, 'cluster-1', 'existing-ns')]);
    mockApply.mockRejectedValueOnce(new Error('nope'));

    fireEvent.click(await fillProjectWithExistingNamespace('half-created-project', 'existing-ns'));
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());

    const nameInput = screen.getByLabelText(/Project Name/i);
    fireEvent.change(nameInput, { target: { value: 'another-project' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled());

    // Back to the half-created project: its own rows are still not a conflict, so it can be retried
    fireEvent.change(nameInput, { target: { value: 'half-created-project' } });
    expect(screen.queryByText('A project with this name already exists')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled());
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
