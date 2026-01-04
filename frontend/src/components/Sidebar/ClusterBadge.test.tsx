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

describe('ClusterBadge', () => {
  it('renders cluster name', () => {
    render(
      <TestContext>
        <ClusterBadge name="test-cluster" />
      </TestContext>
    );

    expect(screen.getByText('test-cluster')).toBeInTheDocument();
  });

  it('renders with accent color', () => {
    const { container } = render(
      <TestContext>
        <ClusterBadge name="test-cluster" accentColor="#ff0000" />
      </TestContext>
    );

    const badge = container.firstChild;
    expect(badge).toBeInTheDocument();
  });

  it('renders with custom icon', () => {
    const { container } = render(
      <TestContext>
        <ClusterBadge name="test-cluster" icon="mdi:kubernetes" />
      </TestContext>
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with default icon when no icon provided', () => {
    const { container } = render(
      <TestContext>
        <ClusterBadge name="test-cluster" />
      </TestContext>
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with all props', () => {
    render(
      <TestContext>
        <ClusterBadge name="production-cluster" accentColor="#2196f3" icon="mdi:server" />
      </TestContext>
    );

    expect(screen.getByText('production-cluster')).toBeInTheDocument();
  });
});
