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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ServiceDetails from './Details';

const { service, unreachable, endpointsUseList, endpointSlicesUseList } = vi.hoisted(() => {
  // Both selected clusters have a "web" Service with its own Endpoints and EndpointSlice.
  const endpoints = [
    { cluster: 'cluster-a', getName: () => 'web', getAddresses: () => ['10.0.0.1'] },
    { cluster: 'cluster-b', getName: () => 'web', getAddresses: () => ['10.1.0.1'] },
  ];
  const endpointSlices = endpoints.map(({ cluster, getAddresses }) => ({
    cluster,
    getName: () => `web-${cluster}`,
    getOwnerServiceName: () => 'web',
    spec: { addressType: 'IPv4', endpoints: [{ addresses: getAddresses() }] },
  }));
  const unreachable = { cluster: '' };

  // Like KubeObject.useList: without a cluster it lists every selected cluster, and it returns
  // the first error from any of them.
  const fakeUseList = (items: { cluster: string }[]) =>
    vi.fn(({ cluster }: { namespace?: string; cluster?: string }) => {
      const listed = cluster ? [cluster] : ['cluster-b', 'cluster-a'];
      const failed = listed.find(name => name === unreachable.cluster);
      return [
        items.filter(item => listed.includes(item.cluster) && item.cluster !== failed),
        failed ? new Error(`${failed} is unreachable`) : null,
      ];
    });

  return {
    service: { current: {} as any },
    unreachable,
    endpointsUseList: fakeUseList(endpoints),
    endpointSlicesUseList: fakeUseList(endpointSlices),
  };
});

vi.mock('../../lib/k8s/endpoints', () => ({ default: { useList: endpointsUseList } }));
vi.mock('../../lib/k8s/endpointSlices', () => ({ default: { useList: endpointSlicesUseList } }));

// DetailsGrid normally fetches the Service. Render its extra sections for a fixed item.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) =>
    props
      .extraSections(service.current)
      .map((section: any) => <div key={section.id}>{section.section}</div>),
  MetadataDictGrid: () => null,
  TargetedPodsSection: () => null,
}));

vi.mock('../common/Link', () => ({
  default: (props: any) => <span>{props.kubeObject.getName()}</span>,
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderDetails(urlPath: string, serviceCluster: string, clusterProp?: string) {
  window.history.pushState({}, '', urlPath);
  service.current = {
    cluster: serviceCluster,
    metadata: { name: 'web', namespace: 'default' },
    spec: { ports: [] },
    getName: () => 'web',
  };
  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <ServiceDetails name="web" namespace="default" cluster={clusterProp} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('ServiceDetails endpoints with two clusters selected', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    vi.clearAllMocks();
    unreachable.cluster = '';
  });

  afterEach(() => {
    window.history.pushState({}, '', originalPath);
  });

  it("lists only the Service's own cluster on the details page", () => {
    // The details route passes no cluster. The Service's cluster comes first in the URL.
    renderDetails('/c/cluster-b+cluster-a/services/default/web', 'cluster-b');

    // One address in the Endpoints table and one in the EndpointSlices table.
    expect(screen.getAllByText('10.1.0.1')).toHaveLength(2);
    expect(screen.queryAllByText('10.0.0.1')).toHaveLength(0);
    const request = { namespace: 'default', cluster: 'cluster-b' };
    expect(endpointsUseList).toHaveBeenCalledWith(request);
    expect(endpointSlicesUseList).toHaveBeenCalledWith(request);
  });

  it("does not show another cluster's list error on the details page", () => {
    unreachable.cluster = 'cluster-a';
    renderDetails('/c/cluster-b+cluster-a/services/default/web', 'cluster-b');

    expect(screen.queryAllByText(/cluster-a is unreachable/)).toHaveLength(0);
    expect(screen.getAllByText('10.1.0.1')).toHaveLength(2);
  });

  it('lists the cluster that the details drawer passes', () => {
    // The drawer opens over the list page and passes the Service's cluster.
    renderDetails('/c/cluster-b+cluster-a/services', 'cluster-a', 'cluster-a');

    expect(screen.getAllByText('10.0.0.1')).toHaveLength(2);
    expect(screen.queryAllByText('10.1.0.1')).toHaveLength(0);
    const request = { namespace: 'default', cluster: 'cluster-a' };
    expect(endpointsUseList).toHaveBeenCalledWith(request);
    expect(endpointSlicesUseList).toHaveBeenCalledWith(request);
  });
});
