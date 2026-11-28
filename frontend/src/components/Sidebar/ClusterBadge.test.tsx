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
import { TestContext } from '../../test';
import ClusterBadge from './ClusterBadge';

// Iconify loads icon data asynchronously; replace it with a simple element so tests are
// synchronous and we can assert on the props ClusterBadge passes down.
vi.mock('@iconify/react', () => ({
  Icon: ({ icon, ...rest }: { icon: string; [key: string]: unknown }) => (
    <span data-icon={icon} {...rest} />
  ),
}));

function renderBadge(props: React.ComponentProps<typeof ClusterBadge>) {
  return render(
    <TestContext>
      <ClusterBadge {...props} />
    </TestContext>
  );
}

const singleLineEllipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

describe('ClusterBadge', () => {
  describe('name', () => {
    it('renders the cluster name', () => {
      renderBadge({ name: 'test-cluster' });

      expect(screen.getByText('test-cluster')).toBeInTheDocument();
    });

    it('exposes the full name as a tooltip (title)', () => {
      renderBadge({ name: 'test-cluster' });

      expect(screen.getByText('test-cluster')).toHaveAttribute('title', 'test-cluster');
    });

    it('truncates long names on a single line with an ellipsis', () => {
      const longName = 'a-very-long-cluster-name-that-should-never-wrap-onto-a-second-line';
      renderBadge({ name: longName });

      const nameEl = screen.getByText(longName);
      expect(nameEl).toHaveStyle(singleLineEllipsis);
      // The full text is still available to the user
      expect(nameEl).toHaveAttribute('title', longName);
    });
  });

  describe('secondary text', () => {
    it('renders secondary text when provided', () => {
      renderBadge({ name: 'minikube', secondary: 'Kubeconfig: default' });

      expect(screen.getByText('minikube')).toBeInTheDocument();
      expect(screen.getByText('Kubeconfig: default')).toBeInTheDocument();
    });

    it('does not render secondary text when omitted', () => {
      const { container } = renderBadge({ name: 'minikube' });

      // Only the name has a title
      expect(container.querySelectorAll('[title]')).toHaveLength(1);
    });

    it('keeps long paths on one line and exposes the full path as a tooltip', () => {
      const path = 'Kubeconfig: default · /home/shashank/.kube/config';
      renderBadge({ name: 'minikube', secondary: path });

      const secondaryEl = screen.getByText(path);
      expect(secondaryEl).toHaveAttribute('title', path);
      expect(secondaryEl).toHaveStyle(singleLineEllipsis);
    });

    it('does not break the text at arbitrary characters', () => {
      const path = '/home/shashank/.kube/config';
      renderBadge({ name: 'minikube', secondary: path });

      // The wrapping behaviour that used to split paths mid-word must be gone
      expect(screen.getByText(path)).not.toHaveStyle({ overflowWrap: 'anywhere' });
    });
  });

  describe('icon', () => {
    it('renders no icon when none is provided', () => {
      renderBadge({ name: 'test-cluster' });

      expect(screen.queryByTestId('cluster-badge-icon')).toBeNull();
      expect(screen.getByText('test-cluster')).toBeInTheDocument();
    });

    it('renders the given icon', () => {
      renderBadge({ name: 'test-cluster', icon: 'mdi:kubernetes' });

      expect(screen.getByTestId('cluster-badge-icon')).toHaveAttribute(
        'data-icon',
        'mdi:kubernetes'
      );
    });

    it('draws an accent-colored border around the icon when accentColor is set', () => {
      renderBadge({ name: 'test-cluster', icon: 'mdi:server', accentColor: '#ff0000' });

      const circle = screen.getByTestId('cluster-badge-icon').parentElement!;
      expect(circle).toHaveStyle({ border: '2px solid #ff0000', borderRadius: '50%' });
    });

    it('does not draw a border when accentColor is not set', () => {
      renderBadge({ name: 'test-cluster', icon: 'mdi:server' });

      const circle = screen.getByTestId('cluster-badge-icon').parentElement!;
      expect(circle).not.toHaveStyle({ borderStyle: 'solid' });
    });

    it('does not shrink the icon circle when the text is long', () => {
      renderBadge({ name: 'x'.repeat(200), icon: 'mdi:server' });

      const circle = screen.getByTestId('cluster-badge-icon').parentElement!;
      expect(circle).toHaveStyle({ width: '28px', height: '28px', flexShrink: '0' });
    });
  });

  it('renders with all props', () => {
    renderBadge({
      name: 'production-cluster',
      secondary: 'Kubeconfig: prod',
      accentColor: '#2196f3',
      icon: 'mdi:server',
    });

    expect(screen.getByText('production-cluster')).toBeInTheDocument();
    expect(screen.getByText('Kubeconfig: prod')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-badge-icon')).toBeInTheDocument();
  });
});
