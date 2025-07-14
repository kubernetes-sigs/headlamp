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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TestContext } from '../../test';
import Pod from '../../lib/k8s/pod';
import { PodLogViewer } from './Details';

// Mock the xterm library
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    open: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    loadAddon: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(() => ({})),
}));

const mockPod = {
  metadata: {
    name: 'test-pod',
    namespace: 'default',
    uid: 'test-uid',
  },
  spec: {
    containers: [
      { name: 'main-container' },
      { name: 'sidecar-container' },
    ],
  },
  status: {
    containerStatuses: [
      {
        name: 'main-container',
        restartCount: 0,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
      },
      {
        name: 'sidecar-container',
        restartCount: 3,
        state: { waiting: { reason: 'CrashLoopBackOff' } },
        lastState: { terminated: { reason: 'Error', exitCode: 1 } },
      },
    ],
  },
  getName: () => 'test-pod',
  getNamespace: () => 'default',
  getLogs: vi.fn(() => vi.fn()),
} as unknown as Pod;

describe('PodLogViewer', () => {
  const defaultProps = {
    open: true,
    item: mockPod,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the log viewer with container selection', () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    expect(screen.getByText('Logs: test-pod')).toBeInTheDocument();
    expect(screen.getByLabelText(/Container/)).toBeInTheDocument();
  });

  it('shows previous logs option for restarted containers', async () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    // Select the sidecar container that has restarts
    const containerSelect = screen.getByLabelText(/Container/);
    fireEvent.mouseDown(containerSelect);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('sidecar-container'));
    });

    // Should show previous logs option
    expect(screen.getByText(/Previous Logs/)).toBeInTheDocument();
  });

  it('shows crashed container indicator', async () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    // Select the crashed sidecar container
    const containerSelect = screen.getByLabelText(/Container/);
    fireEvent.mouseDown(containerSelect);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('sidecar-container'));
    });

    // Should show crashed indicator
    expect(screen.getByText(/Previous Logs \(Crashed\)/)).toBeInTheDocument();
  });

  it('disables previous logs for containers without restarts', async () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    // Main container should be selected by default (no restarts)
    const previousSwitch = screen.getByRole('checkbox', { name: /Previous/ });
    expect(previousSwitch).toBeDisabled();
  });

  it('enables previous logs when showPreviousDefault is true', () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} showPreviousDefault={true} />
      </TestContext>
    );

    // Should start with previous logs enabled
    const previousSwitch = screen.getByRole('checkbox', { name: /Previous/ });
    expect(previousSwitch).toBeChecked();
  });

  it('calls getLogs with correct parameters when previous logs is enabled', async () => {
    const mockGetLogs = vi.fn(() => vi.fn());
    const podWithMockGetLogs = { ...mockPod, getLogs: mockGetLogs };

    render(
      <TestContext>
        <PodLogViewer {...defaultProps} item={podWithMockGetLogs} showPreviousDefault={true} />
      </TestContext>
    );

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledWith(
        'main-container',
        expect.any(Function),
        expect.objectContaining({
          showPrevious: true,
        })
      );
    });
  });

  it('toggles previous logs when switch is clicked', async () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    // Select the sidecar container that has restarts
    const containerSelect = screen.getByLabelText(/Container/);
    fireEvent.mouseDown(containerSelect);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('sidecar-container'));
    });

    const previousSwitch = screen.getByRole('checkbox', { name: /Previous/ });
    expect(previousSwitch).not.toBeChecked();

    // Click to enable previous logs
    fireEvent.click(previousSwitch);
    expect(previousSwitch).toBeChecked();
  });

  it('shows warning icon when viewing previous logs', async () => {
    render(
      <TestContext>
        <PodLogViewer {...defaultProps} />
      </TestContext>
    );

    // Select the sidecar container and enable previous logs
    const containerSelect = screen.getByLabelText(/Container/);
    fireEvent.mouseDown(containerSelect);
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('sidecar-container'));
    });

    const previousSwitch = screen.getByRole('checkbox', { name: /Previous/ });
    fireEvent.click(previousSwitch);

    // Should show warning icon
    expect(screen.getByTitle(/Viewing logs from crashed container/)).toBeInTheDocument();
  });
});
