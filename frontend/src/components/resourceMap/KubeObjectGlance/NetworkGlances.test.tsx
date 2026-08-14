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
import { EndpointsGlance } from './EndpointsGlance';
import { ServiceGlance } from './ServiceGlance';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').at(-1) }),
}));
vi.mock('../../common/Label', () => ({
  StatusLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe('EndpointsGlance', () => {
  it('flattens addresses and renders non-null ports from every subset', () => {
    render(
      <EndpointsGlance
        endpoints={
          {
            subsets: [
              {
                addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }],
                ports: [{ protocol: 'TCP', port: 80 }, null],
              },
              { addresses: [{ ip: '10.0.0.3' }], ports: [{ protocol: 'UDP', port: 53 }] },
              {},
            ],
          } as any
        }
      />
    );

    expect(screen.getByText('Addresses: 10.0.0.1, 10.0.0.2, 10.0.0.3,')).toBeInTheDocument();
    expect(screen.getByText('TCP:80')).toBeInTheDocument();
    expect(screen.getByText('UDP:53')).toBeInTheDocument();
  });

  it('renders an empty address list when subsets are missing', () => {
    render(<EndpointsGlance endpoints={{} as any} />);

    expect(screen.getByText('Addresses:')).toBeInTheDocument();
  });
});

describe('ServiceGlance', () => {
  it('renders type, cluster IP, external addresses, and every port', () => {
    render(
      <ServiceGlance
        service={
          {
            spec: {
              type: 'LoadBalancer',
              clusterIP: '10.96.0.10',
              ports: [
                { protocol: 'TCP', port: 80 },
                { protocol: 'TCP', port: 443 },
              ],
            },
            getExternalAddresses: () => '203.0.113.10',
          } as any
        }
      />
    );

    expect(screen.getByText('Type: LoadBalancer')).toBeInTheDocument();
    expect(screen.getByText('Cluster IP: 10.96.0.10')).toBeInTheDocument();
    expect(screen.getByText('External IP: 203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('TCP:80')).toBeInTheDocument();
    expect(screen.getByText('TCP:443')).toBeInTheDocument();
  });

  it('omits optional external addresses and ports', () => {
    render(
      <ServiceGlance
        service={
          {
            spec: { type: 'ClusterIP', clusterIP: 'None' },
            getExternalAddresses: () => '',
          } as any
        }
      />
    );

    expect(screen.getByText('Type: ClusterIP')).toBeInTheDocument();
    expect(screen.getByText('Cluster IP: None')).toBeInTheDocument();
    expect(screen.queryByText(/^External IP:/)).not.toBeInTheDocument();
  });
});
