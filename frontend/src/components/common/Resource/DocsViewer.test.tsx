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

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetDocsPromise } from '../../../lib/docs';
import { TestContext } from '../../../test';
import DocsViewer from './DocsViewer';

// Mock only the underlying network call, not the docs module itself, so the
// test exercises docs.ts's real module-level docsPromise caching and
// group/version/kind filtering logic instead of bypassing it.
vi.mock('../../../lib/k8s/api/v1/clusterRequests', () => ({
  request: vi.fn(),
}));

import { request } from '../../../lib/k8s/api/v1/clusterRequests';

function makeOpenApiDoc(kind: 'Deployment' | 'Service') {
  const definitions =
    kind === 'Deployment'
      ? {
          'io.k8s.api.apps.v1.Deployment': {
            description: 'Deployment docs',
            properties: { staleDeploymentOnlyProp: { type: 'string' } },
            'x-kubernetes-group-version-kind': [
              { group: 'apps', version: 'v1', kind: 'Deployment' },
            ],
          },
        }
      : {
          'io.k8s.api.core.v1.Service': {
            description: 'Service docs',
            properties: { freshServiceOnlyProp: { type: 'string' } },
            'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Service' }],
          },
        };

  // swagger-parser validates this is a well-formed OpenAPI v2 document
  // before dereferencing it, so it needs the required top-level fields.
  return {
    swagger: '2.0',
    info: { title: 'Test', version: '1.0' },
    paths: {},
    definitions,
  };
}

describe('DocsViewer', () => {
  afterEach(() => {
    // docsPromise is a module-level singleton in lib/docs.ts; clear it so
    // tests don't leak fetches/state into each other.
    resetDocsPromise();
  });

  it('ignores a slower, earlier fetch that resolves after a newer one', async () => {
    const mockRequest = vi.mocked(request);

    // First render asks for Deployment docs. This kicks off the real,
    // module-level docsPromise in lib/docs.ts, backed by this deferred
    // request() call so we control exactly when it resolves.
    let resolveDeploymentFetch: (value: any) => void = () => {};
    mockRequest.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDeploymentFetch = resolve;
        })
    );
    // Second render's fetch resolves immediately.
    mockRequest.mockImplementationOnce(() => Promise.resolve(makeOpenApiDoc('Service')));

    const { rerender } = render(
      <TestContext>
        <DocsViewer docSpecs={[{ apiVersion: 'apps/v1', kind: 'Deployment' }]} />
      </TestContext>
    );

    // Model the real independent-async boundary docsPromise caching allows:
    // resetDocsPromise() (already exported by lib/docs.ts, and invoked there
    // itself whenever a request fails) drops the shared, still-pending
    // Deployment promise so the next getDocDefinitions call kicks off a
    // genuinely new, independent /openapi/v2 request rather than awaiting
    // the same cached one. Without this, the second call would just await
    // the first (still-pending) docsPromise and could never resolve first.
    resetDocsPromise();

    // Simulate the user switching resource kind then reopening the Docs tab.
    rerender(
      <TestContext>
        <DocsViewer docSpecs={[{ apiVersion: 'v1', kind: 'Service' }]} />
      </TestContext>
    );

    // Let the Service fetch (registered on rerender) resolve and render.
    // This goes through the real getDocs() chain (request() + a dynamic
    // import + swagger dereference), so give it a few microtask turns via
    // waitFor rather than a single act() tick.
    await waitFor(() => expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument());

    // Now resolve the stale Deployment fetch, after the Service one has
    // already settled and rendered.
    await act(async () => {
      resolveDeploymentFetch(makeOpenApiDoc('Deployment'));
    });
    // Give the resolved (stale) Deployment fetch's chain a chance to flush
    // through the same real getDocs() pipeline before asserting it lost.
    await act(async () => {});

    // The stale Deployment response must never win, even though it resolves
    // after the Service one settled the effect.
    expect(screen.queryByText('staleDeploymentOnlyProp')).not.toBeInTheDocument();
    expect(screen.getByText('freshServiceOnlyProp')).toBeInTheDocument();
  });
});
