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

import 'vitest-canvas-mock';
import { render, screen } from '@testing-library/react';
import { TestContext } from '../../test';
import { ClusterTerminal } from './ClusterTerminal';

vi.mock('../../lib/cluster', () => ({
  getCluster: () => 'test-cluster',
}));

global.WebSocket = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1,
})) as any;

describe('Cluster Terminal', () => {
  it('renders the terminal with the correct cluster name', () => {
    setTimeout(() => {}, 500);
    render(
      <TestContext>
        <ClusterTerminal />
      </TestContext>
    );

    expect(screen.getByText('Terminal: test-cluster')).toBeInTheDocument();
  });

  it('closes the socket on unmount', () => {
    const { unmount } = render(
      <TestContext>
        <ClusterTerminal />
      </TestContext>
    );

    const mockSocket = (global.WebSocket as any).mock.results[0].value;
    unmount();

    expect(mockSocket.close).toHaveBeenCalled();
  });
});
