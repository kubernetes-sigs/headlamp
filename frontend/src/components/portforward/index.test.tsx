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

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import PortForwardingList from './index';
vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: {
        changeLanguage: vi.fn(),
      },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  };
});

// vi.hoisted runs before imports so mock fns are available in vi.mock factories
const {
  mockListPortForward,
  mockStartPortForward,
  mockStopOrDeletePortForward,
  mockGetCluster,
  mockTable,
  mockEnqueueSnackbar,
} = vi.hoisted(() => ({
  mockListPortForward: vi.fn(),
  mockStartPortForward: vi.fn(),
  mockStopOrDeletePortForward: vi.fn(),
  mockGetCluster: vi.fn((): string | null => 'test-cluster'),
  mockTable: vi.fn(),
  mockEnqueueSnackbar: vi.fn(),
}));

vi.mock('../../lib/k8s/api/v1/portForward', () => ({
  listPortForward: (...args: any[]) => mockListPortForward(...args),
  startPortForward: (...args: any[]) => mockStartPortForward(...args),
  stopOrDeletePortForward: (...args: any[]) => mockStopOrDeletePortForward(...args),
}));

vi.mock('../../lib/util', async importOriginal => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getCluster: () => mockGetCluster(),
  };
});

vi.mock('../../helpers/isDockerDesktop', () => ({
  isDockerDesktop: () => false,
}));

vi.mock('notistack', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

// Mock the Table component to avoid theme-dependent rendering (tables.head.borderColor)
// while still exposing the data passed to it for assertions.
vi.mock('../common/Table', () => ({
  default: (props: any) => {
    mockTable(props);
    const filteredData = props.data || [];
    return (
      <div data-testid="mock-table">
        {filteredData.map((item: any) => (
          <div key={item.id} data-testid={`pf-row-${item.id}`}>
            <span>{item.pod || item.service}</span>
            <span>{item.serviceNamespace || item.namespace}</span>
            <span>{item.status}</span>
            {item.error && <span>Error</span>}
          </div>
        ))}
      </div>
    );
  },
  __esModule: true,
}));

// Mock SectionBox to avoid SectionHeader theme dependency (palette.headerStyle)
vi.mock('../common/SectionBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  __esModule: true,
}));

// Constants — inlined to avoid transitive import issues
const PORT_FORWARD_RUNNING_STATUS = 'Running';
const PORT_FORWARD_STOP_STATUS = 'Stopped';
const PORT_FORWARDS_STORAGE_KEY = 'portforwards';

// --- Helpers ---

function makePortForward(overrides: Record<string, any> = {}) {
  return {
    id: 'pf-1',
    pod: 'my-pod',
    service: '',
    serviceNamespace: '',
    namespace: 'default',
    cluster: 'test-cluster',
    port: '8080',
    targetPort: '80',
    status: PORT_FORWARD_RUNNING_STATUS,
    error: '',
    ...overrides,
  };
}

function renderList() {
  return render(
    <TestContext>
      <PortForwardingList />
    </TestContext>
  );
}

// --- Tests ---

describe('PortForwardingList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCluster.mockReturnValue('test-cluster');
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the port forwarding table with data from the API', async () => {
    const pf = makePortForward();
    mockListPortForward.mockResolvedValue([pf]);

    renderList();

    await waitFor(() => {
      expect(screen.getByText('my-pod')).toBeInTheDocument();
    });
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('renders an empty table when no port forwards exist', async () => {
    mockListPortForward.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(mockListPortForward).toHaveBeenCalledWith('test-cluster');
    });
    expect(screen.queryByText('my-pod')).not.toBeInTheDocument();
  });

  it('handles non-array API responses safely', async () => {
    // API returns something unexpected (not an array)
    mockListPortForward.mockResolvedValue(null);

    renderList();

    // Should not crash — the Array.isArray guard protects it
    await waitFor(() => {
      expect(mockListPortForward).toHaveBeenCalled();
    });
  });

  it('handles corrupted localStorage gracefully', async () => {
    // Seed corrupted JSON in storage
    localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, '{INVALID JSON}}}}');
    mockListPortForward.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(mockListPortForward).toHaveBeenCalled();
    });

    // localStorage should have been self-healed to empty array
    const healed = localStorage.getItem(PORT_FORWARDS_STORAGE_KEY);
    expect(healed).toBe(JSON.stringify([]));
  });

  it('merges stopped localStorage entries with running backend entries', async () => {
    const runningPf = makePortForward({ id: 'pf-running', status: PORT_FORWARD_RUNNING_STATUS });
    const stoppedPf = makePortForward({
      id: 'pf-stopped',
      pod: 'old-pod',
      status: PORT_FORWARD_STOP_STATUS,
    });

    // Backend only knows about the running one
    mockListPortForward.mockResolvedValue([runningPf]);
    // localStorage has the stopped one
    localStorage.setItem(PORT_FORWARDS_STORAGE_KEY, JSON.stringify([stoppedPf]));

    renderList();

    await waitFor(() => {
      expect(screen.getByText('my-pod')).toBeInTheDocument();
    });
    // The stopped localStorage entry should also be visible
    expect(screen.getByText('old-pod')).toBeInTheDocument();
  });

  it('does not update state after unmount (isMountedRef guard)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a deferred promise so we can control when listPortForward resolves
    let resolveList!: (value: any) => void;
    const deferredPromise = new Promise(resolve => {
      resolveList = resolve;
    });
    mockListPortForward.mockReturnValue(deferredPromise);

    const { unmount } = renderList();

    // Unmount before the promise resolves
    unmount();

    // Now resolve — the isMountedRef guard should prevent setState
    resolveList([makePortForward()]);

    // Flush microtasks so the .then() callback executes
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert React did not log an unmounted setState warning
    const reactWarnings = consoleErrorSpy.mock.calls.filter(call =>
      String(call[0]).includes('unmounted')
    );
    expect(reactWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it('shows error status for port forwards with errors', async () => {
    const errorPf = makePortForward({
      error: 'connection refused',
      status: PORT_FORWARD_STOP_STATUS,
    });
    mockListPortForward.mockResolvedValue([errorPf]);

    renderList();

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('only shows port forwards for the current cluster', async () => {
    const pfCurrentCluster = makePortForward({
      id: 'pf-current',
      cluster: 'test-cluster',
      pod: 'current-pod',
    });
    const pfOtherCluster = makePortForward({
      id: 'pf-other',
      cluster: 'other-cluster',
      pod: 'other-pod',
    });
    mockListPortForward.mockResolvedValue([pfCurrentCluster, pfOtherCluster]);

    renderList();

    await waitFor(() => {
      expect(screen.getByText('current-pod')).toBeInTheDocument();
    });
    // The mock Table receives filtered data — verify other-cluster is not shown
    expect(screen.queryByText('other-pod')).not.toBeInTheDocument();
  });

  it('does not fetch when cluster is null', async () => {
    mockGetCluster.mockReturnValue(null);
    mockListPortForward.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(mockGetCluster).toHaveBeenCalled();
    });

    expect(mockListPortForward).not.toHaveBeenCalled();
  });

  it('handles listPortForward API failure gracefully', async () => {
    mockListPortForward.mockRejectedValue(new Error('Network error'));

    renderList();

    // Should not crash
    await waitFor(() => {
      expect(mockListPortForward).toHaveBeenCalled();
    });
  });

  it('passes correct filtered data to the Table component', async () => {
    const pf = makePortForward();
    mockListPortForward.mockResolvedValue([pf]);

    renderList();

    await waitFor(() => {
      expect(mockTable).toHaveBeenCalled();
    });

    // Verify the Table received the filtered data (only current cluster)
    const lastCall = mockTable.mock.calls[mockTable.mock.calls.length - 1][0];
    expect(lastCall.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ cluster: 'test-cluster' })])
    );
  });

  it('stores all port forwards with Stopped status in localStorage', async () => {
    const pf = makePortForward({ status: PORT_FORWARD_RUNNING_STATUS });
    mockListPortForward.mockResolvedValue([pf]);

    renderList();

    await waitFor(() => {
      expect(screen.getByText('my-pod')).toBeInTheDocument();
    });

    // localStorage should store all port forwards with status = 'Stopped'
    const stored = JSON.parse(localStorage.getItem(PORT_FORWARDS_STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe(PORT_FORWARD_STOP_STATUS);
  });

  it('does not show error snackbar on initial render even if portforward has error', async () => {
    // fetchPortForwardList is called with showError=undefined on initial mount,
    // so even if the API returns a portforward with an error, no snackbar should fire.
    const errorPf = makePortForward({ error: 'bind: address already in use' });
    mockListPortForward.mockResolvedValue([errorPf]);
    mockEnqueueSnackbar.mockClear();

    renderList();

    await waitFor(() => {
      expect(screen.getByText('my-pod')).toBeInTheDocument();
    });

    // The initial fetch does not pass showError=true, so snackbar should not be called
    // with the portforward error (it may be called for other reasons, so filter).
    const errorCalls = mockEnqueueSnackbar.mock.calls.filter(
      (call: any[]) => call[0] === 'bind: address already in use'
    );
    expect(errorCalls).toHaveLength(0);
  });

  it('logs error but suppresses snackbar when listPortForward rejects on initial mount', async () => {
    // On initial mount, fetchPortForwardList() is called without showError,
    // so a rejection should log the error but NOT trigger a snackbar.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListPortForward.mockRejectedValue(new Error('Network error'));
    mockEnqueueSnackbar.mockClear();

    renderList();

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching port forwards:',
        expect.any(Error)
      );
    });

    // No snackbar on initial fetch (showError is not passed)
    const snackbarCalls = mockEnqueueSnackbar.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('Network error')
    );
    expect(snackbarCalls).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});
