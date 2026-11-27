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
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import ServiceDetails from './Details';

const { service, endpoints, endpointSlices } = vi.hoisted(() => {
  const endpointSlice = (name: string) => ({
    getName: () => name,
    getOwnerServiceName: () => 'example-service',
    spec: { addressType: 'IPv4', endpoints: [{ addresses: ['10.0.0.1'] }] },
  });

  return {
    service: {
      cluster: '',
      metadata: { name: 'example-service', namespace: 'default' },
      spec: { ports: [{ protocol: 'TCP', port: 80, targetPort: 8080 }] },
      getName: () => 'example-service',
    },
    endpoints: [{ getName: () => 'example-service', getAddresses: () => ['10.0.0.1'] }],
    // One more than the default 15 rows per page, so the table has a second page.
    endpointSlices: Array.from({ length: 16 }, (_, i) => endpointSlice(`example-service-${i + 1}`)),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) =>
    props
      .extraSections(service)
      .map((section: any) => <div key={section.id}>{section.section}</div>),
  MetadataDictGrid: () => null,
  TargetedPodsSection: () => null,
}));

vi.mock('../common/Resource/PortForward', () => ({ default: () => null }));

vi.mock('../common/Link', () => ({
  default: (props: any) => <span>{props.kubeObject.getName()}</span>,
}));

vi.mock('../../lib/k8s/endpoints', () => ({
  default: { useList: () => [endpoints, null] },
}));

vi.mock('../../lib/k8s/endpointSlices', () => ({
  default: { useList: () => [endpointSlices, null] },
}));

vi.mock('../../lib/k8s/service', () => ({ default: { kind: 'Service' } }));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function LocationSearch() {
  return <div data-testid="location-search">{useLocation().search}</div>;
}

describe('ServiceDetails', () => {
  it('keeps the EndpointSlices page in its own URL parameter', () => {
    // The Endpoints table only ever has one row, so it resets its page parameter to the first
    // page. The EndpointSlices page must not be stored under that parameter, or a reload loses it.
    render(
      <TestContext urlSearchParams={{ 'endpointslices.p': '2' }}>
        <ThemeProvider theme={theme}>
          <ServiceDetails name="example-service" namespace="default" />
          <LocationSearch />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('example-service-16')).toBeInTheDocument();
    expect(screen.queryByText('example-service-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('endpointslices.p=2');
  });
});
