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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import CRD from '../../../lib/k8s/crd';
import CronJob from '../../../lib/k8s/cronJob';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import Job from '../../../lib/k8s/job';
import JobSet from '../../../lib/k8s/jobSet';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import LeaderWorkerSet from '../../../lib/k8s/leaderWorkerSet';
import { LimitRange } from '../../../lib/k8s/limitRange';
import Pod from '../../../lib/k8s/pod';
import { PodMetrics } from '../../../lib/k8s/PodMetrics';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import ResourceQuota from '../../../lib/k8s/resourceQuota';
import Secret from '../../../lib/k8s/secret';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { TestContext } from '../../../test';
import { ClusterGroupErrorMessage } from '../../cluster/ClusterGroupErrorMessage';
import CustomResourceDefinitionList from '../../crd/List';
import { mockCRD } from '../../crd/storyHelper';
import JobsList from '../../job/List';
import { LimitRangeList } from '../../limitRange/List';
import PodList from '../../pod/List';
import ResourceQuotaList from '../../resourceQuota/List';
import SecretList from '../../secret/List';
import { BASE_SECRET } from '../../secret/storyHelper';
import WorkloadOverview from '../../workload/Overview';
import { CreateResourceButton } from '../CreateResourceButton';
import ResourceListView from './ResourceListView';

const { createButtonProps, lastResourceTablePropsHolder, lastSectionFilterHeaderPropsHolder } =
  vi.hoisted(() => ({
    createButtonProps: vi.fn(),
    lastResourceTablePropsHolder: { current: null as any },
    lastSectionFilterHeaderPropsHolder: { current: null as any },
  }));

vi.mock('../CreateResourceButton', () => ({
  CreateResourceButton: (props: any) => {
    createButtonProps(props);
    return null;
  },
}));

vi.mock('../../workload/Charts', () => ({ WorkloadCircleChart: () => null }));

vi.mock('../SectionBox', () => {
  const SectionBox = (props: any) => (
    <>
      {props.title}
      {props.children}
    </>
  );
  return { default: SectionBox, SectionBox };
});

vi.mock('../SectionFilterHeader', () => ({
  default: (props: any) => {
    lastSectionFilterHeaderPropsHolder.current = props;
    return <>{props.titleSideActions}</>;
  },
}));

// Capture props ResourceListView forwards to ResourceTable, so we can inspect
// the auto-injected emptyActions without dragging in the whole table stack.
vi.mock('./ResourceTable', () => ({
  __esModule: true,
  default: (props: any) => {
    lastResourceTablePropsHolder.current = props;
    return (
      <div data-testid="mock-resource-table">
        <ClusterGroupErrorMessage errors={props.errors} watchErrors={props.watchErrors} />
        {props.errorMessage ? (
          <span>{props.errorMessage}</span>
        ) : (
          props.data?.map((item: CRD | Secret) => (
            <span key={item.getName()}>{item.getName()}</span>
          ))
        )}
      </div>
    );
  },
  useThrottle: (value: unknown) => value,
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

  describe('direct list consumers', () => {
    afterEach(() => vi.restoreAllMocks());

    function listResponse({
      items,
      error = null,
      errors = error ? [error] : null,
      watchErrors = [],
      isFetching = false,
    }: {
      items: KubeObject[] | null;
      error?: ApiError | null;
      errors?: ApiError[] | null;
      watchErrors?: ApiError[];
      isFetching?: boolean;
    }) {
      const tuple: [KubeObject[] | null, ApiError | null] = [items, error];
      const result = {
        data: null,
        dataUpdatedAt: items === null ? 0 : 1,
        items,
        error,
        errors,
        watchErrors,
        isFetching,
        isError: !!error,
        isLoading: !items && !error,
        isSuccess: !!items && !error,
        status: error ? ('error' as const) : items ? ('success' as const) : ('pending' as const),
      };
      return Object.assign(tuple, result, {
        clusterResults: items === null ? undefined : { test: result },
      });
    }

    const snapshotPages = [
      {
        name: 'CRD',
        resourceClass: CRD,
        Page: CustomResourceDefinitionList,
        item: new CRD(mockCRD, 'test'),
      },
      {
        name: 'Secret',
        resourceClass: Secret,
        Page: SecretList,
        item: new Secret(BASE_SECRET, 'test'),
      },
    ];

    it('retains workload rows and shows failed recovery LIST errors', () => {
      const error = new ApiError('Workload recovery forbidden', { status: 403 });
      const job = new Job(
        {
          apiVersion: 'batch/v1',
          kind: 'Job',
          metadata: {
            name: 'cached-job',
            namespace: 'default',
            uid: 'cached-job',
            creationTimestamp: '2026-11-26T00:00:00Z',
          },
          spec: { template: { spec: { containers: [], nodeName: 'test-node' } } },
          status: {},
        },
        'test'
      );
      for (const resourceClass of [
        Pod,
        Deployment,
        StatefulSet,
        DaemonSet,
        ReplicaSet,
        Job,
        CronJob,
        JobSet,
        LeaderWorkerSet,
      ]) {
        vi.spyOn(resourceClass, 'useList').mockReturnValue(
          listResponse({
            items: resourceClass === Job ? [job] : [],
            error: resourceClass === Job ? error : null,
          })
        );
      }
      render(
        <TestContext>
          <WorkloadOverview />
        </TestContext>
      );
      expect(screen.getByText('cached-job')).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You don't have permissions to view this resource"
      );
      expect(lastResourceTablePropsHolder.current.errorMessage).toBeUndefined();
    });

    it.each(snapshotPages)(
      'keeps $name rows and empty snapshots visible through pending and failed refresh',
      ({ resourceClass, Page, item }) => {
        const query = {
          items: [item],
          error: null as ApiError | null,
          errors: null as ApiError[] | null,
          watchErrors: [] as ApiError[],
          isFetching: false,
        };
        vi.spyOn(resourceClass, 'useList').mockImplementation(() => listResponse(query));
        const content = () => (
          <TestContext>
            <Page />
          </TestContext>
        );
        const view = render(content());
        expect(screen.getByText(item.getName())).toBeVisible();

        const warning = new ApiError('Resource watch reconnecting');
        Object.assign(query, { isFetching: true, watchErrors: [warning] });
        view.rerender(content());
        expect(screen.getByText(item.getName())).toBeVisible();
        expect(screen.getByRole('alert')).toHaveTextContent(warning.message);

        const error = new ApiError('Refresh forbidden', { status: 403 });
        Object.assign(query, {
          error,
          errors: [error],
          watchErrors: [],
          isFetching: false,
        });
        view.rerender(content());
        expect(screen.getByText(item.getName())).toBeVisible();
        expect(lastResourceTablePropsHolder.current.errorMessage).toBeUndefined();
        expect(screen.getByRole('alert')).toHaveTextContent(
          "You don't have permissions to view this resource"
        );

        query.items = [];
        view.rerender(content());
        expect(lastResourceTablePropsHolder.current.data).toEqual([]);
        expect(lastResourceTablePropsHolder.current.errorMessage).toBeUndefined();
        expect(screen.getByRole('alert')).toBeVisible();

        Object.assign(query, {
          error: null,
          errors: null,
          watchErrors: [warning],
          isFetching: true,
        });
        view.rerender(content());
        expect(lastResourceTablePropsHolder.current.data).toEqual([]);
        expect(lastResourceTablePropsHolder.current.errorMessage).toBeUndefined();
        expect(screen.getByRole('alert')).toHaveTextContent(warning.message);
      }
    );

    it.each(snapshotPages)(
      'preserves the initial no-snapshot $name error',
      ({ resourceClass, Page }) => {
        const error = new ApiError('Initial list forbidden', { status: 403 });
        vi.spyOn(resourceClass, 'useList').mockReturnValue(listResponse({ items: null, error }));

        render(
          <TestContext>
            <Page />
          </TestContext>
        );

        expect(screen.getByText('Error: No permissions')).toBeVisible();
        expect(lastResourceTablePropsHolder.current.data).toBeNull();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      }
    );

    it.each([
      { name: 'Pod', resourceClass: Pod, Page: PodList },
      { name: 'Job', resourceClass: Job, Page: JobsList },
      { name: 'LimitRange', resourceClass: LimitRange, Page: LimitRangeList },
      { name: 'ResourceQuota', resourceClass: ResourceQuota, Page: ResourceQuotaList },
    ])('forwards $name watch errors alongside its snapshot', ({ resourceClass, Page }) => {
      const warning = new ApiError('Watch unavailable');
      vi.spyOn(resourceClass, 'useList').mockReturnValue(
        listResponse({ items: [], watchErrors: [warning] })
      );
      vi.spyOn(PodMetrics, 'useList').mockReturnValue(listResponse({ items: null }));

      render(
        <TestContext>
          <Page />
        </TestContext>
      );

      expect(screen.getByRole('alert')).toHaveTextContent(warning.message);
      expect(lastResourceTablePropsHolder.current.data).toEqual([]);
      expect(lastResourceTablePropsHolder.current.errorMessage).toBeUndefined();
    });
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

  it('auto-injects EmptyStateActions for a data list that has a Create button in its header', () => {
    renderView({
      title: 'Pods',
      data: [],
      columns: [],
      headerProps: {
        titleSideActions: [
          <span key="other-action" />,
          <CreateResourceButton key="create" resourceClass={podClass} cluster="dra" />,
        ],
      },
    });
    const { getByTestId } = render(<>{lastResourceTablePropsHolder.current.emptyActions}</>);
    expect(getByTestId('empty-state-actions').getAttribute('data-kind')).toBe('Pod');
    expect(getByTestId('empty-state-actions').getAttribute('data-cluster')).toBe('dra');
  });

  it('does not inject a default for a data list whose header has no Create button', () => {
    renderView({
      title: 'Pods',
      data: [],
      columns: [],
      headerProps: { titleSideActions: [<span key="other-action" />] },
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeUndefined();
  });

  it('does not inject a default for a data list that hides its Create button', () => {
    renderView({ title: 'Pods', data: [], columns: [], headerProps: { titleSideActions: [] } });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeUndefined();
  });

  it('respects emptyActions={null} on a data list with a Create button in its header', () => {
    renderView({
      title: 'Pods',
      data: [],
      columns: [],
      emptyActions: null,
      headerProps: {
        titleSideActions: [<CreateResourceButton key="create" resourceClass={podClass} />],
      },
    });
    expect(lastResourceTablePropsHolder.current.emptyActions).toBeNull();
  });
});

// Lightweight fakes standing in for a real KubeObjectClass, so these tests don't
// need to pull in an actual resource-class import graph.
class FakeNamespacedResource {
  static isNamespaced = true;
}

class FakeClusterScopedResource {
  static isNamespaced = false;
}

describe('ResourceListView effective noNamespaceFilter', () => {
  beforeEach(() => {
    lastResourceTablePropsHolder.current = null;
    lastSectionFilterHeaderPropsHolder.current = null;
  });

  describe('without a resourceClass', () => {
    it.each([
      {
        description: 'headerProps is not provided',
        headerProps: undefined,
        expected: true,
      },
      {
        description: 'headerProps is {} (no noNamespaceFilter key)',
        headerProps: {},
        expected: true,
      },
      {
        description:
          'headerProps has a noNamespaceFilter key present but undefined (e.g. Pod/Job renderers)',
        headerProps: { noNamespaceFilter: undefined },
        expected: false,
      },
      {
        description: 'headerProps.noNamespaceFilter is explicitly false',
        headerProps: { noNamespaceFilter: false },
        expected: false,
      },
      {
        description: 'headerProps.noNamespaceFilter is explicitly true',
        headerProps: { noNamespaceFilter: true },
        expected: true,
      },
    ])(
      'resolves noNamespaceFilter=$expected for both SectionFilterHeader and ResourceTable when $description',
      ({ headerProps, expected }) => {
        render(
          <TestContext>
            <ResourceListView title="Pods" columns={[]} data={[]} headerProps={headerProps} />
          </TestContext>
        );

        expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(expected);
        expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(expected);
      }
    );
  });

  describe('with a resourceClass and no header override', () => {
    it.each([
      {
        description: 'a namespaced resourceClass',
        resourceClass: FakeNamespacedResource,
        expected: false,
      },
      {
        description: 'a cluster-scoped resourceClass',
        resourceClass: FakeClusterScopedResource,
        expected: true,
      },
    ])(
      'resolves noNamespaceFilter=$expected for both SectionFilterHeader and ResourceTable given $description',
      ({ resourceClass, expected }) => {
        render(
          <TestContext>
            <ResourceListView title="Pods" columns={[]} resourceClass={resourceClass as any} />
          </TestContext>
        );

        expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(expected);
        expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(expected);
      }
    );
  });

  // Pod/Job renderers may pass a headerProps object with the key present but undefined.
  // Preserve their existing behavior: show the selector and apply the namespace filter.
  it('keeps applying the namespace filter when noNamespaceFilter is explicitly undefined', () => {
    render(
      <TestContext>
        <ResourceListView
          title="Pods"
          columns={[]}
          data={[]}
          headerProps={{ noNamespaceFilter: undefined, titleSideActions: [] }}
        />
      </TestContext>
    );

    expect(lastResourceTablePropsHolder.current.noNamespaceFilter).toBe(false);
    expect(lastSectionFilterHeaderPropsHolder.current.noNamespaceFilter).toBe(false);
  });
});
