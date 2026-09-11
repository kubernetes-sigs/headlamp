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

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import DocsViewer from './DocsViewer';

vi.mock('../../../lib/docs', () => ({
  default: vi.fn(),
}));

import getDocDefinitions from '../../../lib/docs';

describe('DocsViewer', () => {
  it('ignores a slower, earlier fetch that resolves after a newer one', async () => {
    const mockGetDocDefinitions = vi.mocked(getDocDefinitions);

    // First render asks for Deployment docs; its response is deferred so we
    // control exactly when it resolves. Its schema has a property name
    // unique to this response so we can tell whether it ever made it into
    // the rendered tree.
    let resolveDeploymentFetch: (value: any) => void = () => {};
    mockGetDocDefinitions.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDeploymentFetch = resolve;
        })
    );
    // Second render (simulating the user switching kind then reopening the
    // Docs tab) asks for Service docs, and resolves immediately.
    mockGetDocDefinitions.mockImplementationOnce(() =>
      Promise.resolve({
        description: 'Service docs',
        properties: { freshServiceOnlyProp: { type: 'string' } },
      })
    );

    const { rerender } = render(
      <TestContext>
        <DocsViewer docSpecs={[{ apiVersion: 'apps/v1', kind: 'Deployment' }]} />
      </TestContext>
    );

    rerender(
      <TestContext>
        <DocsViewer docSpecs={[{ apiVersion: 'v1', kind: 'Service' }]} />
      </TestContext>
    );

    // Let the Service fetch (registered on rerender) resolve and render.
    await act(async () => {});
    expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();

    // Now resolve the stale Deployment fetch, after the Service one has
    // already settled and rendered.
    await act(async () =>
      resolveDeploymentFetch({
        description: 'Deployment docs',
        properties: { staleDeploymentOnlyProp: { type: 'string' } },
      })
    );

    // The stale Deployment response must never win, even though it resolves
    // after the Service one settled the effect.
    expect(screen.queryByText('staleDeploymentOnlyProp')).not.toBeInTheDocument();
    expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();
  });
});
