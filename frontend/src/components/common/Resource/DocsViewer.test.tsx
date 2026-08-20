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

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import DocsViewer from './DocsViewer';

vi.mock('../../../lib/docs', () => ({
  default: vi.fn(),
}));

import getDocDefinitions from '../../../lib/docs';

/** Resolves after `ms` milliseconds with the given value. */
function resolveAfter<T>(value: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

describe('DocsViewer', () => {
  it('ignores a slower, earlier fetch that resolves after a newer one', async () => {
    const mockGetDocDefinitions = vi.mocked(getDocDefinitions);

    // First render asks for Deployment docs, but that fetch is slow. Its
    // schema has a property name unique to this response so we can tell
    // whether it ever made it into the rendered tree.
    mockGetDocDefinitions.mockImplementationOnce(() =>
      resolveAfter(
        {
          description: 'Deployment docs',
          properties: { staleDeploymentOnlyProp: { type: 'string' } },
        },
        50
      )
    );
    // Second render (simulating the user switching kind then reopening the
    // Docs tab) asks for Service docs, and resolves quickly.
    mockGetDocDefinitions.mockImplementationOnce(() =>
      resolveAfter(
        { description: 'Service docs', properties: { freshServiceOnlyProp: { type: 'string' } } },
        5
      )
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

    // Wait long enough for both the fast (Service) and slow (Deployment)
    // fetches to have settled.
    await waitFor(() => {
      expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();
    });

    // The stale Deployment response must never win, even though it resolves
    // after the Service one settles the effect.
    expect(screen.queryByText('staleDeploymentOnlyProp')).not.toBeInTheDocument();
  });
});
