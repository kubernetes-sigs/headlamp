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
import { GraphNode } from './graph/graphModel';
import { SelectionBreadcrumbs } from './SelectionBreadcrumbs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').at(-1) }),
}));

vi.mock('./kubeIcon/KubeIcon', () => ({
  KubeIcon: ({ kind, apiGroup }: { kind: string; apiGroup: string }) => (
    <span data-testid="kube-icon">{`${kind}:${apiGroup}`}</span>
  ),
}));

describe('SelectionBreadcrumbs', () => {
  it('renders the path to the selection and invokes clicks for ancestor nodes', () => {
    const onNodeClick = vi.fn();
    const graph: GraphNode = {
      id: 'root',
      nodes: [
        {
          id: 'workloads',
          label: 'Workloads',
          subtitle: 'Group',
          nodes: [
            {
              id: 'deployment',
              kubeObject: {
                kind: 'Deployment',
                metadata: { name: 'frontend' },
                jsonData: { apiVersion: 'apps/v1' },
              } as any,
            },
          ],
        },
        { id: 'unrelated', label: 'Unrelated' },
      ],
    };

    render(
      <SelectionBreadcrumbs graph={graph} selectedNodeId="deployment" onNodeClick={onNodeClick} />
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Workloads')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated')).not.toBeInTheDocument();
    expect(screen.getByTestId('kube-icon')).toHaveTextContent('Deployment:apps');
    expect(screen.getByLabelText('Group Workloads')).toBeInTheDocument();
    expect(screen.getByLabelText('Deployment frontend')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Home'));
    fireEvent.click(screen.getByText('Workloads'));

    expect(onNodeClick).toHaveBeenNthCalledWith(1, 'root');
    expect(onNodeClick).toHaveBeenNthCalledWith(2, 'workloads');
    fireEvent.click(screen.getByText('frontend'));
    expect(onNodeClick).toHaveBeenCalledTimes(2);
  });

  it('uses a main child name for grouped nodes and core for unsuffixed API versions', () => {
    const graph: GraphNode = {
      id: 'root',
      nodes: [
        {
          id: 'group',
          kubeObject: {
            kind: 'Service',
            metadata: { name: 'service-name' },
            jsonData: { apiVersion: 'v1' },
          } as any,
          nodes: [
            {
              id: 'pod',
              kubeObject: { kind: 'Pod', metadata: { name: 'main-pod' } } as any,
            },
          ],
        },
        {
          id: 'selected-group',
          nodes: [
            {
              id: 'deployment',
              kubeObject: { kind: 'Deployment', metadata: { name: 'main-deployment' } } as any,
            },
            {
              id: 'service',
              kubeObject: { kind: 'Service', metadata: { name: 'secondary-service' } } as any,
            },
          ],
        },
      ],
    };

    render(<SelectionBreadcrumbs graph={graph} selectedNodeId="group" onNodeClick={vi.fn()} />);

    expect(screen.getByText('service-name')).toBeInTheDocument();
    expect(screen.getByTestId('kube-icon')).toHaveTextContent('Service:core');

    render(
      <SelectionBreadcrumbs graph={graph} selectedNodeId="selected-group" onNodeClick={vi.fn()} />
    );

    expect(screen.getByText('main-deployment')).toBeInTheDocument();
  });

  it('renders nothing when the selected node is absent', () => {
    const { container } = render(
      <SelectionBreadcrumbs
        graph={{ id: 'root', nodes: [{ id: 'child', label: 'Child' }] }}
        selectedNodeId="missing"
        onNodeClick={vi.fn()}
      />
    );

    expect(container.querySelectorAll('nav li')).toHaveLength(0);
  });

  it('renders an empty fallback label for a node without identifying data', () => {
    const { container } = render(
      <SelectionBreadcrumbs
        graph={{ id: 'anonymous' }}
        selectedNodeId="anonymous"
        onNodeClick={vi.fn()}
      />
    );

    expect(container.querySelector('[aria-label=""]')).toBeInTheDocument();
  });
});
