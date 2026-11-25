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
import { ReactElement } from 'react';
import { TestContext } from '../../test';
import BackendTLSPolicyDetails from './BackendTLSPolicyDetails';
import GatewayClassDetails from './ClassDetails';
import GatewayDetails from './GatewayDetails';
import ReferenceGrantDetails from './ReferenceGrantDetails';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  ConditionsTable: () => null,
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../../lib/k8s/gateway', () => ({
  default: { kind: 'Gateway' },
}));

vi.mock('../../lib/k8s/gatewayClass', () => ({
  default: { kind: 'GatewayClass' },
}));

vi.mock('../../lib/k8s/referenceGrant', () => ({
  default: { kind: 'ReferenceGrant' },
}));

vi.mock('../../lib/k8s/backendTLSPolicy', () => ({
  default: { kind: 'BackendTLSPolicy' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').pop() ?? key }),
}));

type DetailsProps = { name?: string; namespace?: string; cluster?: string };

// The details drawer and the Resource Map pass the clicked object's cluster.
const detailsComponents: [string, (props: DetailsProps) => ReactElement, DetailsProps][] = [
  ['Gateway', GatewayDetails, { name: 'edge', namespace: 'infra' }],
  ['GatewayClass', GatewayClassDetails, { name: 'eg' }],
  ['ReferenceGrant', ReferenceGrantDetails, { name: 'allow-routes', namespace: 'infra' }],
  ['BackendTLSPolicy', BackendTLSPolicyDetails, { name: 'api-tls', namespace: 'apps' }],
];

describe.each(detailsComponents)('%s details', (_, Details, resource) => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    render(
      <TestContext>
        <Details {...resource} cluster="cluster-b" />
      </TestContext>
    );
  });

  it('passes the given cluster to DetailsGrid', () => {
    expect(mockDetailsGrid.mock.calls[0][0]).toMatchObject({
      ...resource,
      cluster: 'cluster-b',
    });
  });
});
