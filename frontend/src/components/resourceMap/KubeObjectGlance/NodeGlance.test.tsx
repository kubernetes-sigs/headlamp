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
import { NodeGlance } from './NodeGlance';

const mocks = vi.hoisted(() => ({
  state: { graphView: { glances: {} as Record<string, any> } },
}));

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: any) => unknown) => selector(mocks.state),
}));
vi.mock('../../../lib/k8s/KubeObject', () => ({
  KubeObject: class KubeObject {},
}));
vi.mock('./KubeObjectGlance', () => ({
  KubeObjectGlance: ({ resource }: any) => <div>kube:{resource.name}</div>,
}));

describe('NodeGlance', () => {
  beforeEach(() => {
    mocks.state.graphView.glances = {};
  });

  it('renders nothing when there are no registered glances or Kubernetes object', () => {
    const { container } = render(<NodeGlance node={{ id: 'plain' }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders every registered custom glance with the node', () => {
    mocks.state.graphView.glances = {
      first: {
        id: 'first',
        component: ({ node }: any) => <div>first:{node.id}</div>,
      },
      second: {
        id: 'second',
        component: ({ node }: any) => <div>second:{node.id}</div>,
      },
    };

    render(<NodeGlance node={{ id: 'custom' }} />);

    expect(screen.getByText('first:custom')).toBeInTheDocument();
    expect(screen.getByText('second:custom')).toBeInTheDocument();
  });

  it('appends the Kubernetes glance after custom glances', async () => {
    const { KubeObject } = await import('../../../lib/k8s/KubeObject');
    const resource = Object.assign(new KubeObject({} as any), { name: 'pod-a' });
    mocks.state.graphView.glances = {
      custom: { id: 'custom', component: () => <div>custom-glance</div> },
    };

    render(<NodeGlance node={{ id: 'pod', kubeObject: resource as any }} />);

    expect(screen.getByText('custom-glance')).toBeInTheDocument();
    expect(screen.getByText('kube:pod-a')).toBeInTheDocument();
  });

  it('renders a Kubernetes glance without plugin registrations', async () => {
    const { KubeObject } = await import('../../../lib/k8s/KubeObject');
    const resource = Object.assign(new KubeObject({} as any), { name: 'service-a' });

    render(<NodeGlance node={{ id: 'service', kubeObject: resource as any }} />);

    expect(screen.getByText('kube:service-a')).toBeInTheDocument();
  });
});
