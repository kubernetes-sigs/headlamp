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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { NodeProps } from '@xyflow/react';
import { GraphNode } from '../graph/graphModel';
import { KubeObjectNodeComponent } from './KubeObjectNode';

const mocks = vi.hoisted(() => ({
  activityLaunch: vi.fn(),
  node: undefined as GraphNode | undefined,
  nodeSelection: undefined as string | undefined,
  setNodeSelection: vi.fn(),
}));

vi.mock('../GraphView', () => ({
  useGraphView: () => ({
    nodeSelection: mocks.nodeSelection,
    setNodeSelection: mocks.setNodeSelection,
  }),
  useNode: () => mocks.node,
}));

vi.mock('../../activity/Activity', () => ({
  Activity: { launch: (...args: any[]) => mocks.activityLaunch(...args) },
}));

vi.mock('../../../lib/k8s/cluster', () => ({}));

vi.mock('../../../lib/k8s/namespace', () => ({
  default: { isClassOf: () => false },
}));

vi.mock('../../../lib/k8s/node', () => ({
  default: { isClassOf: () => false },
}));

vi.mock('../../../lib/k8s/pod', () => ({
  default: { isClassOf: () => false },
}));

vi.mock('@xyflow/react', () => ({
  Handle: ({ position, type }: any) => (
    <span data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Bottom: 'bottom', Top: 'top' },
}));

vi.mock('@iconify/react', () => ({
  Icon: ({ color, height, icon, width }: any) => (
    <span
      data-testid="status-icon"
      data-color={color}
      data-height={height}
      data-icon={icon}
      data-width={width}
    />
  ),
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

vi.mock('../KubeObjectGlance/NodeGlance', () => ({
  NodeGlance: ({ node }: { node: GraphNode }) => <span data-testid="node-glance">{node.id}</span>,
}));

vi.mock('../details/GraphNodeDetails', () => ({
  GraphNodeDetails: ({ node }: { node: GraphNode }) => (
    <span data-testid="graph-node-details">{node.id}</span>
  ),
}));

vi.mock('./GroupNode', () => ({
  GroupNodeComponent: ({ id }: { id: string }) => <span data-testid="group-node">{id}</span>,
}));

function makeKubeObject({
  apiVersion = 'v1',
  cluster = 'test-cluster',
  kind = 'Pod',
  name = 'test-object',
} = {}) {
  return {
    cluster,
    jsonData: { apiVersion },
    kind,
    metadata: { name },
  } as any;
}

function nodeProps(id: string): NodeProps {
  return {
    data: {},
    deletable: true,
    draggable: true,
    dragging: false,
    id,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: false,
    type: 'kubeObject',
    zIndex: 0,
  };
}

describe('KubeObjectNodeComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.activityLaunch.mockReset();
    mocks.node = undefined;
    mocks.nodeSelection = undefined;
    mocks.setNodeSelection.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when the graph node is missing', () => {
    const { container } = render(<KubeObjectNodeComponent {...nodeProps('missing')} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('delegates an expanded group to GroupNodeComponent', () => {
    mocks.node = {
      id: 'group',
      collapsed: false,
      nodes: [{ id: 'child' }],
    };

    render(<KubeObjectNodeComponent {...nodeProps('group')} />);

    expect(screen.getByTestId('group-node')).toHaveTextContent('group');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders object defaults, API group, handles, and no success badge', () => {
    mocks.node = {
      id: 'deployment',
      kubeObject: makeKubeObject({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'frontend',
      }),
      status: 'success',
    };

    render(<KubeObjectNodeComponent {...nodeProps('deployment')} />);

    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-api-group', 'apps');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-kind', 'Deployment');
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-width', '42px');
    expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'top');
    expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'bottom');
    expect(screen.queryByTestId('status-icon')).not.toBeInTheDocument();
  });

  it('uses custom text and icon when there is no Kubernetes object', () => {
    mocks.node = {
      id: 'external',
      icon: <span data-testid="custom-icon" />,
      label: 'database',
      subtitle: 'External',
    };

    render(<KubeObjectNodeComponent {...nodeProps('external')} />);

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByText('External')).toBeInTheDocument();
    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.queryByTestId('kube-icon')).not.toBeInTheDocument();
  });

  it('uses the highest-weight child object and shows a collapsed warning and count', () => {
    mocks.node = {
      id: 'group',
      collapsed: true,
      nodes: [
        {
          id: 'service',
          kubeObject: makeKubeObject({ kind: 'Service', name: 'frontend-service' }),
          status: 'success',
          weight: 1,
        },
        {
          id: 'deployment',
          kubeObject: makeKubeObject({
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: 'frontend-deployment',
          }),
          status: 'warning',
          weight: 100,
        },
      ],
    };

    render(<KubeObjectNodeComponent {...nodeProps('group')} />);

    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.getByText('frontend-deployment')).toBeInTheDocument();
    expect(screen.getByTestId('kube-icon')).toHaveAttribute('data-api-group', 'apps');
    expect(screen.getByTestId('status-icon')).toHaveAttribute('data-icon', 'mdi:information');
    expect(screen.getByTestId('status-icon')).toHaveAttribute('data-width', '22px');
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('gives an error child precedence over warnings', () => {
    mocks.node = {
      id: 'error-group',
      collapsed: true,
      nodes: [
        { id: 'warning', status: 'warning' },
        { id: 'error', status: 'error' },
      ],
    };

    render(<KubeObjectNodeComponent {...nodeProps('error-group')} />);

    expect(screen.getByTestId('status-icon')).toHaveAttribute('data-icon', 'mdi:exclamation');
  });

  it('selects and launches Kubernetes object details with the expected payload', () => {
    mocks.node = {
      id: 'pod',
      kubeObject: makeKubeObject({ name: 'frontend-pod' }),
    };

    render(<KubeObjectNodeComponent {...nodeProps('pod')} />);
    fireEvent.click(screen.getByRole('button'));

    expect(mocks.setNodeSelection).toHaveBeenCalledWith('pod');
    expect(mocks.activityLaunch).toHaveBeenCalledTimes(1);

    const payload = mocks.activityLaunch.mock.calls[0][0];
    expect(payload).toMatchObject({
      cluster: 'test-cluster',
      hideTitleInHeader: true,
      id: 'pod',
      location: 'split-right',
      temporary: true,
      title: 'frontend-pod',
    });
    expect(payload.icon.props).toMatchObject({
      apiGroup: 'core',
      height: '100%',
      kind: 'Pod',
      width: '100%',
    });
    expect(payload.content.props.node).toBe(mocks.node);
  });

  it('launches custom details without an activity icon or cluster', () => {
    const Details = () => <span>Custom details</span>;
    mocks.node = {
      id: 'custom-details',
      detailsComponent: Details,
      label: 'Custom node',
    };

    render(<KubeObjectNodeComponent {...nodeProps('custom-details')} />);
    fireEvent.click(screen.getByRole('button'));

    expect(mocks.activityLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: undefined,
        icon: null,
        title: 'Custom node',
      })
    );
  });

  it('selects groups and contentless nodes without launching details', () => {
    mocks.node = {
      id: 'collapsed-group',
      collapsed: true,
      nodes: [{ id: 'child' }],
    };
    const { rerender } = render(<KubeObjectNodeComponent {...nodeProps('collapsed-group')} />);

    fireEvent.click(screen.getByRole('button'));

    mocks.node = { id: 'contentless', label: 'Contentless' };
    rerender(<KubeObjectNodeComponent {...nodeProps('contentless')} />);
    fireEvent.click(screen.getByRole('button'));

    expect(mocks.setNodeSelection).toHaveBeenNthCalledWith(1, 'collapsed-group');
    expect(mocks.setNodeSelection).toHaveBeenNthCalledWith(2, 'contentless');
    expect(mocks.activityLaunch).not.toHaveBeenCalled();
  });

  it('activates once for Enter and Space but ignores unrelated and repeated keys', () => {
    mocks.node = { id: 'keyboard', detailsComponent: () => null };
    render(<KubeObjectNodeComponent {...nodeProps('keyboard')} />);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'Escape' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    fireEvent.keyDown(button, { key: 'Enter' });

    const repeatedSpaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(button, repeatedSpaceEvent);

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(button, spaceEvent);

    expect(repeatedSpaceEvent.defaultPrevented).toBe(true);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(mocks.setNodeSelection).toHaveBeenCalledTimes(2);
    expect(mocks.activityLaunch).toHaveBeenCalledTimes(2);
  });

  it('expands after sustained focus and collapses on blur', () => {
    mocks.node = { id: 'hovered', label: 'Hovered' };
    render(<KubeObjectNodeComponent {...nodeProps('hovered')} />);
    const button = screen.getByRole('button');

    fireEvent.focus(button);
    act(() => vi.advanceTimersByTime(449));
    expect(screen.queryByTestId('node-glance')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('node-glance')).toHaveTextContent('hovered');
    expect(button).toHaveClass('kube-object-node--expanded');
    expect(button).toHaveStyle({ zIndex: '10000' });

    fireEvent.blur(button);
    expect(screen.queryByTestId('node-glance')).not.toBeInTheDocument();
  });

  it('cancels pending expansion when the pointer leaves', () => {
    mocks.node = { id: 'hovered', label: 'Hovered' };
    render(<KubeObjectNodeComponent {...nodeProps('hovered')} />);
    const button = screen.getByRole('button');

    fireEvent.pointerEnter(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerLeave(button);
    act(() => vi.advanceTimersByTime(450));

    expect(screen.queryByTestId('node-glance')).not.toBeInTheDocument();
  });
});
