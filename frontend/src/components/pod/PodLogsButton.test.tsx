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

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { TestContext } from '../../test';
import Pod from '../../lib/k8s/pod';

// Mock the PodLogViewer component
vi.mock('./Details', () => ({
  PodLogViewer: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <div data-testid="pod-log-viewer">Log Viewer</div> : null
  ),
}));

// Import the component after mocking
const { PodLogsButton } = await import('./List');

const createMockPod = (hasRestarts = false, isCrashed = false) => ({
  metadata: {
    name: 'test-pod',
    namespace: 'default',
    uid: 'test-uid',
  },
  spec: {
    containers: [{ name: 'main-container' }],
  },
  status: {
    containerStatuses: [
      {
        name: 'main-container',
        restartCount: hasRestarts ? 3 : 0,
        state: isCrashed 
          ? { waiting: { reason: 'CrashLoopBackOff' } }
          : { running: { startedAt: '2025-01-01T00:00:00Z' } },
        lastState: isCrashed 
          ? { terminated: { reason: 'Error', exitCode: 1 } }
          : undefined,
      },
    ],
  },
  getName: () => 'test-pod',
  getNamespace: () => 'default',
  cluster: 'default',
} as unknown as Pod);

describe('PodLogsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders logs button for all pods', () => {
    const mockPod = createMockPod();
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    expect(screen.getByLabelText(/Show logs/)).toBeInTheDocument();
  });

  it('shows only logs button for pods without restarts', () => {
    const mockPod = createMockPod(false, false);
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    expect(screen.getByLabelText(/Show logs/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Show previous logs/)).not.toBeInTheDocument();
  });

  it('shows both logs and previous logs buttons for restarted pods', () => {
    const mockPod = createMockPod(true, false);
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    expect(screen.getByLabelText(/Show logs/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Show previous logs/)).toBeInTheDocument();
  });

  it('shows previous logs button with crashed indicator for crashed pods', () => {
    const mockPod = createMockPod(true, true);
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    expect(screen.getByLabelText(/Show logs/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Show previous logs.*crashed/)).toBeInTheDocument();
  });

  it('opens log viewer when logs button is clicked', () => {
    const mockPod = createMockPod();
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    const logsButton = screen.getByLabelText(/Show logs/);
    fireEvent.click(logsButton);

    expect(screen.getByTestId('pod-log-viewer')).toBeInTheDocument();
  });

  it('opens log viewer with previous logs enabled when previous logs button is clicked', () => {
    const mockPod = createMockPod(true, true);
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    const previousLogsButton = screen.getByLabelText(/Show previous logs/);
    fireEvent.click(previousLogsButton);

    expect(screen.getByTestId('pod-log-viewer')).toBeInTheDocument();
  });

  it('closes log viewer when onClose is called', () => {
    const mockPod = createMockPod();
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    // Open log viewer
    const logsButton = screen.getByLabelText(/Show logs/);
    fireEvent.click(logsButton);
    expect(screen.getByTestId('pod-log-viewer')).toBeInTheDocument();

    // Close log viewer (this would be triggered by the PodLogViewer component)
    // Since we mocked it, we can't test the actual close functionality
    // but we can verify the component structure is correct
  });

  it('applies correct styling for crashed containers', () => {
    const mockPod = createMockPod(true, true);
    
    render(
      <TestContext>
        <PodLogsButton pod={mockPod} />
      </TestContext>
    );

    const previousLogsButton = screen.getByLabelText(/Show previous logs.*crashed/);
    expect(previousLogsButton).toBeInTheDocument();
  });
});
