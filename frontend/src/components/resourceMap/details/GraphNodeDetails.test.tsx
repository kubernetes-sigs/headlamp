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

import { render, screen } from '@testing-library/react';
import { GraphNode } from '../graph/graphModel';
import { GraphNodeDetails } from './GraphNodeDetails';

const kubeObjectDetailsMock = vi.fn(({ resource, customResourceDefinition }: any) => (
  <div data-testid="kube-object-details">
    {resource.metadata.name}:{customResourceDefinition ?? 'built-in'}
  </div>
));

vi.mock('./KubeNodeDetails', () => ({
  KubeObjectDetails: (props: any) => kubeObjectDetailsMock(props),
}));

describe('GraphNodeDetails', () => {
  beforeEach(() => {
    kubeObjectDetailsMock.mockClear();
  });

  it('renders nothing without a node or renderable content', () => {
    const { container, rerender } = render(<GraphNodeDetails />);

    expect(container).toBeEmptyDOMElement();

    rerender(<GraphNodeDetails node={{ id: 'group' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Kubernetes details and forwards the custom resource definition', () => {
    const resource = {
      kind: 'Widget',
      metadata: { name: 'my-widget', namespace: 'default' },
    } as any;

    render(
      <GraphNodeDetails
        node={{
          id: 'widget',
          kubeObject: resource,
          customResourceDefinition: 'widgets.example.io',
        }}
      />
    );

    expect(screen.getByTestId('kube-object-details')).toHaveTextContent(
      'my-widget:widgets.example.io'
    );
    expect(kubeObjectDetailsMock).toHaveBeenCalledWith({
      resource,
      customResourceDefinition: 'widgets.example.io',
    });
  });

  it('prefers a custom details component over Kubernetes details', () => {
    const CustomDetails = ({ node }: { node: GraphNode }) => (
      <div data-testid="custom-details">{node.id}</div>
    );

    render(
      <GraphNodeDetails
        node={{
          id: 'custom',
          detailsComponent: CustomDetails,
          kubeObject: { kind: 'Pod', metadata: { name: 'ignored' } } as any,
        }}
      />
    );

    expect(screen.getByTestId('custom-details')).toHaveTextContent('custom');
    expect(kubeObjectDetailsMock).not.toHaveBeenCalled();
  });

  it('does not render stale deferred content after the current node loses content', () => {
    const { container, rerender } = render(
      <GraphNodeDetails
        node={{ id: 'pod', kubeObject: { kind: 'Pod', metadata: { name: 'pod-a' } } as any }}
      />
    );

    expect(screen.getByTestId('kube-object-details')).toBeInTheDocument();

    rerender(<GraphNodeDetails node={{ id: 'empty' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
