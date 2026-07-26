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
import { GraphNode } from '../graph/graphModel';
import { GroupNodeComponent } from './GroupNode';

const mocks = vi.hoisted(() => ({
  node: undefined as GraphNode | undefined,
  setNodeSelection: vi.fn(),
}));

vi.mock('../GraphView', () => ({
  useGraphView: () => ({ setNodeSelection: mocks.setNodeSelection }),
  useNode: () => mocks.node,
}));

vi.mock('../kubeIcon/KubeIcon', () => ({
  KubeIcon: ({ apiGroup, height, kind, width }: any) => (
    <span
      data-testid="kube-icon"
      data-api-group={apiGroup}
      data-height={height}
      data-kind={kind}
      data-width={width}
    />
  ),
}));

vi.mock('../../common/Tooltip', () => ({
  LightTooltip: ({ children, title }: any) => (
    <span data-testid="tooltip" data-title={title}>
      {children}
    </span>
  ),
}));

describe('GroupNodeComponent', () => {
  beforeEach(() => {
    mocks.node = undefined;
    mocks.setNodeSelection.mockReset();
  });

  it('renders Kubernetes object content with its API group and combined tooltip title', () => {
    mocks.node = {
      id: 'deployment',
      label: 'frontend',
      subtitle: 'Deployment',
      kubeObject: {
        kind: 'Deployment',
        jsonData: { apiVersion: 'apps/v1' },
      } as any,
    };

    render(<GroupNodeComponent id="deployment" />);

    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-title', 'Deployment frontend');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-api-group', 'apps');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-kind', 'Deployment');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-width', '24px');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-height', '24px');
  });

  it('uses the core API group and supports a label without a subtitle', () => {
    mocks.node = {
      id: 'pod',
      label: 'frontend-pod',
      kubeObject: {
        kind: 'Pod',
        jsonData: { apiVersion: 'v1' },
      } as any,
    };

    render(<GroupNodeComponent id="pod" />);

    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-title', 'frontend-pod');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-api-group', 'core');
  });

  it('renders a custom icon and omits all label content when the node has no text', () => {
    mocks.node = {
      id: 'custom',
      subtitle: 'External',
      icon: <span data-testid="custom-icon" />,
    };

    const { rerender } = render(<GroupNodeComponent id="custom" />);

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-title', 'External');

    mocks.node = { id: 'empty' };
    rerender(<GroupNodeComponent id="empty" />);

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('custom-icon')).not.toBeInTheDocument();
  });

  it('selects the group on click, Enter, and Space', () => {
    mocks.node = { id: 'group', label: 'Group' };
    render(<GroupNodeComponent id="group" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(button, spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(mocks.setNodeSelection).toHaveBeenNthCalledWith(1, 'group');
    expect(mocks.setNodeSelection).toHaveBeenNthCalledWith(2, 'group');
    expect(mocks.setNodeSelection).toHaveBeenNthCalledWith(3, 'group');
  });

  it('ignores unrelated and repeated activation keys while still preventing repeated Space', () => {
    mocks.node = { id: 'group', label: 'Group' };
    render(<GroupNodeComponent id="group" />);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'Escape' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });

    const repeatedSpaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(button, repeatedSpaceEvent);

    expect(repeatedSpaceEvent.defaultPrevented).toBe(true);
    expect(mocks.setNodeSelection).not.toHaveBeenCalled();
  });
});
