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
  // Note: today getDocDefinitions shares one cached /openapi/v2 promise, so
  // responses for different docSpecs settle in the order they were requested.
  // DocsViewer should not depend on that: this is a contract test that it
  // ignores a response belonging to a previous docSpecs value, even if
  // getDocDefinitions (or its caching) later changes and responses can arrive
  // out of order.
  it('ignores a response for previous docSpecs that settles after newer docSpecs', async () => {
    const mockGetDocDefinitions = vi.mocked(getDocDefinitions);

    // The first call (Deployment) stays pending until we resolve it by hand.
    let resolveDeploymentFetch: (value: any) => void = () => {};
    mockGetDocDefinitions.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDeploymentFetch = resolve;
        })
    );
    // The second call (Service) resolves immediately.
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

    await act(async () => {});
    expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();

    // Now the earlier Deployment response settles, after the Service one.
    await act(async () =>
      resolveDeploymentFetch({
        description: 'Deployment docs',
        properties: { staleDeploymentOnlyProp: { type: 'string' } },
      })
    );

    expect(screen.queryByText('staleDeploymentOnlyProp')).not.toBeInTheDocument();
    expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();
  });
});
