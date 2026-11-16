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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResourceListView from './ResourceListView';

const { createButtonProps, lastResourceTablePropsHolder } = vi.hoisted(() => ({
  createButtonProps: vi.fn(),
  lastResourceTablePropsHolder: { current: null as any },
}));

vi.mock('../CreateResourceButton', () => ({
  CreateResourceButton: (props: any) => {
    createButtonProps(props);
    return null;
  },
}));

vi.mock('../SectionBox', () => ({
  default: (props: any) => (
    <>
      {props.title}
      {props.children}
    </>
  ),
}));

vi.mock('../SectionFilterHeader', () => ({
  default: (props: any) => <>{props.titleSideActions}</>,
}));

// Capture props ResourceListView forwards to ResourceTable, so we can inspect
// the auto-injected emptyActions without dragging in the whole table stack.
vi.mock('./ResourceTable', () => ({
  __esModule: true,
  default: (props: any) => {
    lastResourceTablePropsHolder.current = props;
    return <div data-testid="mock-resource-table" />;
  },
}));

// Mark the EmptyStateActions rendering so we can detect the auto-default.
vi.mock('./EmptyStateActions', () => ({
  EmptyStateActions: ({ resourceClass, cluster }: any) => (
    <div data-testid="empty-state-actions" data-kind={resourceClass?.kind} data-cluster={cluster} />
  ),
}));

const resourceClass = { kind: 'DeviceClass', isNamespaced: false } as any;

const podClass = {
  kind: 'Pod',
  apiName: 'pods',
  apiVersion: 'v1',
  isNamespaced: true,
} as any;

function renderList(clusters?: string[]) {
  render(
    <ResourceListView
      title="Device Classes"
      resourceClass={resourceClass}
      clusters={clusters}
      columns={[]}
    />
  );
}

function renderView(props: any) {
  return render(<ResourceListView {...props} />);
}

describe('ResourceListView', () => {
  beforeEach(() => createButtonProps.mockReset());

  it('leaves the create action on its default cluster when the list is not limited', () => {
    renderList();

    expect(createButtonProps).toHaveBeenCalled();
    expect(createButtonProps.mock.lastCall?.[0].cluster).toBeUndefined();
  });

  it('creates in the first of the clusters the list is limited to', () => {
    renderList(['dra', 'other-dra']);

    expect(createButtonProps.mock.lastCall?.[0].cluster).toBe('dra');
  });

  it('offers no create action when the list is limited to no cluster', () => {
    renderList([]);

    expect(createButtonProps).not.toHaveBeenCalled();
  });
});

describe('ResourceListView emptyActions defaulting', () => {
  beforeEach(() => {
    lastResourceTablePropsHolder.current = null;
  });

  it('auto-injects EmptyStateActions when a resourceClass is provided and the caller did not set emptyActions', () => {
    renderView({ title: <span>Pods</span>, resourceClass: podClass, columns: [] });
    expect(lastResourceTablePropsHolder.current).not.toBeNull();
    const injected = lastResourceTablePropsHolder.current.emptyActions;
    expect(injected).toBeDefined();
    const { getByTestId } = render(<>{injected}</>);
    expect(getByTestId('empty-state-actions').getAttribute('data-kind')).toBe('Pod');
  });

  it('points the empty-state create action at the first of the clusters the list is limited to', () => {
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      clusters: ['dra', 'other-dra'],
      columns: [],
    });
    const { getByTestId } = render(<>{lastResourceTablePropsHolder.current.emptyActions}</>);
    expect(getByTestId('empty-state-actions').getAttribute('data-kind')).toBe('Pod');
    expect(getByTestId('empty-state-actions').getAttribute('data-cluster')).toBe('dra');
  });

  it('offers no empty-state create action when the list is limited to no cluster', () => {
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      clusters: [],
      columns: [],
    });
    const { getByTestId } = render(<>{lastResourceTablePropsHolder.current.emptyActions}</>);
    expect(getByTestId('empty-state-actions').getAttribute('data-kind')).toBeNull();
  });

  it('respects an explicit emptyActions override from the caller', () => {
    const custom = <span data-testid="custom-actions" />;
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      columns: [],
      emptyActions: custom,
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBe(custom);
  });

  it('respects emptyActions={null} to opt out of the default', () => {
    renderView({
      title: <span>Pods</span>,
      resourceClass: podClass,
      columns: [],
      emptyActions: null,
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeNull();
  });

  it('does not inject a default when no resourceClass is provided (nested list on a Details page)', () => {
    renderView({ title: <span>Sub-list</span>, data: [], columns: [] });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeUndefined();
  });
});
