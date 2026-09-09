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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import NamespacesList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/namespace', () => ({
  default: { kind: 'Namespace' },
}));

// Avoid pulling in CreateNamespaceButton's heavy import chain (redux actions,
// AuthVisible, etc.) -- it is irrelevant to these column-level tests, and
// ResourceListView is mocked out below so it never actually renders anyway.
vi.mock('./CreateNamespaceButton', () => ({
  default: () => null,
}));

// List.tsx only needs MetadataDictGrid from this barrel, but the real barrel
// re-exports the entire resource-forms module graph (every Create*Form for
// every workload kind), which triggers a pre-existing circular-import
// ordering hazard between the k8s resource classes when pulled in from a
// fresh module graph. Stub just what's used to avoid that unrelated hazard.
vi.mock('../common/Resource', () => ({
  MetadataDictGrid: ({ dict }: { dict: Record<string, string> }) => (
    <span>{JSON.stringify(dict)}</span>
  ),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function renderList() {
  render(
    <TestContext>
      <NamespacesList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

const column = (props: any, id: string) => props.columns.find((c: any) => c?.id === id);

describe('NamespacesList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    const props = renderList();
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));

    expect(columnIds).toEqual(['name', 'cluster', 'status', 'labels', 'age']);
  });

  it('shows the namespace phase as the status', () => {
    const props = renderList();
    const status = column(props, 'status');
    const active = { status: { phase: 'Active' } };

    expect(status.getValue(active)).toBe('Active');

    render(<TestContext>{status.render(active)}</TestContext>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  // Regression test for a defect where a namespace object built as a
  // name-only placeholder (used when a manually configured namespace's
  // per-name GET fails, e.g. missing RBAC) has no `status`, and reading
  // `namespace.status.phase` unconditionally threw `TypeError: Cannot read
  // properties of undefined (reading 'phase')`, crashing the whole table via
  // ResourceTable's accessorFn. This asserts both the render and the getValue
  // used by the shared table tolerate a missing/empty status and fall back to
  // "Unknown", matching what `main` rendered for these rows.
  it('falls back to Unknown for a placeholder namespace with no status, without throwing', () => {
    const props = renderList();
    const status = column(props, 'status');
    const placeholder = {
      metadata: { name: 'team-b' },
      status: {},
    };

    expect(status.getValue(placeholder)).toBe('translation|Unknown');

    expect(() => render(<TestContext>{status.render(placeholder)}</TestContext>)).not.toThrow();
    expect(screen.getByText('translation|Unknown')).toBeInTheDocument();
  });

  it('falls back to Unknown when status is entirely absent', () => {
    const props = renderList();
    const status = column(props, 'status');
    const placeholder = { metadata: { name: 'team-b' } };

    expect(status.getValue(placeholder)).toBe('translation|Unknown');

    expect(() => render(<TestContext>{status.render(placeholder)}</TestContext>)).not.toThrow();
    expect(screen.getByText('translation|Unknown')).toBeInTheDocument();
  });
});
