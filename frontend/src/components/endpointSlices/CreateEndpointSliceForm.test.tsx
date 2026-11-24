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

import '../../i18n/config';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: CreateEndpointSliceForm } = await import('./CreateEndpointSliceForm');
const { EndpointSliceEndpointsField } = await import('./EndpointSliceEndpointsField');
const { EndpointSlicePortsField } = await import('./EndpointSlicePortsField');
const {
  areEndpointSliceEndpointsValid,
  areEndpointSlicePortsValid,
  getEndpointSliceAddressIssue,
  isValidFQDN,
  isValidLabelValue,
  MAX_ENDPOINT_ADDRESSES,
  SERVICE_NAME_LABEL,
} = await import('./endpointSliceValidation');

/** Mirrors the endpoint EndpointSlice.getBaseObject() seeds (see lib/k8s/endpointSlices.test.ts). */
const baseEndpoint = { addresses: [''], conditions: { ready: true } };

/** The EndpointSlice from the Kubernetes docs, used as the canonical valid input. */
const exampleSlice = {
  apiVersion: 'discovery.k8s.io/v1',
  kind: 'EndpointSlice',
  metadata: { name: 'example-abc', labels: { [SERVICE_NAME_LABEL]: 'example' } },
  addressType: 'IPv4',
  ports: [{ name: 'http', protocol: 'TCP', port: 80 }],
  endpoints: [
    {
      addresses: ['10.1.2.3'],
      conditions: { ready: true },
      hostname: 'pod-1',
      nodeName: 'node-1',
      zone: 'us-west2-a',
    },
  ],
};

describe('isValidFQDN', () => {
  it.each(['backend.example.com', 'a.b', 'backend.example.com.', 'web-0.svc.cluster.local'])(
    'accepts %s',
    name => {
      expect(isValidFQDN(name)).toBe(true);
    }
  );

  it.each([
    '', // empty
    '.', // only the optional trailing dot
    'backend', // a single label
    'Backend.example.com', // uppercase
    'back_end.example.com', // underscore
    '-backend.example.com', // label starts with '-'
    'backend..example.com', // empty label
    `${'a'.repeat(64)}.example.com`, // label longer than 63 characters
  ])('rejects "%s"', name => {
    expect(isValidFQDN(name)).toBe(false);
  });
});

describe('getEndpointSliceAddressIssue', () => {
  it.each([
    ['10.1.2.3', 'IPv4', null],
    ['2001:db8::1', 'IPv6', null],
    ['backend.example.com', 'FQDN', null],
    ['2001:db8::1', 'IPv4', 'not-ipv4'],
    ['not-an-ip', 'IPv4', 'not-ipv4'],
    ['010.1.2.3', 'IPv4', 'not-ipv4'], // leading zeros are rejected by strict parsing
    ['10.1.2.3', 'IPv6', 'not-ipv6'],
    ['::ffff:10.1.2.3', 'IPv4', 'ipv4-mapped'],
    ['::ffff:10.1.2.3', 'IPv6', 'ipv4-mapped'],
    ['127.0.0.1', 'IPv4', 'loopback'],
    ['fe80::1', 'IPv6', 'link-local'],
    ['backend', 'FQDN', 'invalid-fqdn'],
    ['10.1.2.3', 'FQDN', null], // four DNS labels, so the API server accepts it as an FQDN
    ['anything', 'Bogus', null], // unknown address types are not validated by the API server
  ])('reports %s as %s for %s', (address, addressType, issue) => {
    expect(getEndpointSliceAddressIssue(address, addressType)).toBe(issue);
  });
});

describe('areEndpointSlicePortsValid', () => {
  it.each([
    ['no ports', undefined],
    ['an empty list', []],
    ['a single unnamed port', [{ port: 80 }]],
    ['a port without a number (all ports)', [{ name: 'all', protocol: 'TCP' }]],
    [
      'uniquely named ports',
      [
        { name: 'http', port: 80 },
        { name: 'https', port: 443, appProtocol: 'kubernetes.io/h2c' },
      ],
    ],
    ['one named and one unnamed port', [{ name: 'http', port: 80 }, { port: 443 }]],
  ])('accepts %s', (_label, ports) => {
    expect(areEndpointSlicePortsValid(ports)).toBe(true);
  });

  it.each([
    ['two unnamed ports', [{ port: 80 }, { port: 443 }]],
    [
      'duplicate names',
      [
        { name: 'http', port: 80 },
        { name: 'http', port: 8080 },
      ],
    ],
    ['a non-DNS-1123 name', [{ name: 'HTTP', port: 80 }]],
    ['an unsupported protocol', [{ port: 80, protocol: 'BOGUS' }]],
    ['an empty protocol', [{ port: 80, protocol: '' }]],
    ['an empty appProtocol', [{ port: 80, appProtocol: '' }]],
    ['an out-of-range port', [{ port: 70000 }]],
    ['a non-list value', { port: 80 }],
  ])('rejects %s', (_label, ports) => {
    expect(areEndpointSlicePortsValid(ports)).toBe(false);
  });
});

describe('areEndpointSliceEndpointsValid', () => {
  const addresses = (count: number) =>
    Array.from({ length: count }, (_v, i) => `10.0.${i >> 8}.${(i % 255) + 1}`);

  it('accepts an endpoint with the maximum number of addresses', () => {
    const endpoints = [{ addresses: addresses(MAX_ENDPOINT_ADDRESSES) }];
    expect(areEndpointSliceEndpointsValid(endpoints, 'IPv4')).toBe(true);
  });

  it('rejects an endpoint with more than the maximum number of addresses', () => {
    const endpoints = [{ addresses: addresses(MAX_ENDPOINT_ADDRESSES + 1) }];
    expect(areEndpointSliceEndpointsValid(endpoints, 'IPv4')).toBe(false);
  });

  const hintNames = (count: number) =>
    Array.from({ length: count }, (_v, i) => ({ name: `z${i}` }));

  it.each([
    ['no hints', undefined],
    ['empty hints', {}],
    ['eight zone hints', { forZones: hintNames(8) }],
    ['eight node hints', { forNodes: hintNames(8) }],
    ['an empty zone name', { forZones: [{ name: '' }] }],
    ['zone and node hints', { forZones: [{ name: 'us-west2-a' }], forNodes: [{ name: 'node-1' }] }],
  ])('accepts %s', (_label, hints) => {
    expect(areEndpointSliceEndpointsValid([{ addresses: ['10.1.2.3'], hints }], 'IPv4')).toBe(true);
  });

  it.each([
    ['nine zone hints', { forZones: hintNames(9) }],
    ['nine node hints', { forNodes: hintNames(9) }],
    ['a zone name that is not a label value', { forZones: [{ name: 'us west' }] }],
    ['duplicate zone names', { forZones: [{ name: 'a' }, { name: 'a' }] }],
    ['a node name that is not a DNS-1123 subdomain', { forNodes: [{ name: 'Node_1' }] }],
    ['an empty node name', { forNodes: [{ name: '' }] }],
    ['a node hint without a name', { forNodes: [{}] }],
    ['duplicate node names', { forNodes: [{ name: 'node-1' }, { name: 'node-1' }] }],
    ['a non-list forZones', { forZones: { name: 'a' } }],
    ['a non-object hint', { forZones: ['a'] }],
    ['a non-object hints', 'us-west2-a'],
  ])('rejects %s', (_label, hints) => {
    expect(areEndpointSliceEndpointsValid([{ addresses: ['10.1.2.3'], hints }], 'IPv4')).toBe(
      false
    );
  });
});

describe('isValidLabelValue', () => {
  it.each([undefined, '', 'example', 'my_svc.v1', 'a'.repeat(63)])('accepts %s', value => {
    expect(isValidLabelValue(value)).toBe(true);
  });

  it.each(['bad value', '-example', 'example-', 'a/b', 'a'.repeat(64)])('rejects %s', value => {
    expect(isValidLabelValue(value)).toBe(false);
  });
});

describe('CreateEndpointSliceForm', () => {
  function renderForm(
    resource: any,
    onValidChange: (valid: boolean) => void = () => {},
    onChange: (resource: any) => void = () => {}
  ) {
    return render(
      <CreateEndpointSliceForm
        resource={resource}
        onChange={onChange}
        onValidChange={onValidChange}
      />
    );
  }

  function expectValidity(resource: any, expected: boolean) {
    const onValidChange = vi.fn();
    renderForm(resource, onValidChange);
    expect(onValidChange).toHaveBeenLastCalledWith(expected);
  }

  it('accepts the documented example EndpointSlice', () => {
    expectValidity(exampleSlice, true);
  });

  it('accepts an FQDN slice without ports', () => {
    expectValidity(
      {
        metadata: { name: 'external' },
        addressType: 'FQDN',
        endpoints: [{ addresses: ['backend.example.com'] }],
      },
      true
    );
  });

  it('accepts valid hints supplied through YAML', () => {
    expectValidity(
      {
        ...exampleSlice,
        endpoints: [
          {
            ...exampleSlice.endpoints[0],
            hints: { forZones: [{ name: 'us-west2-a' }], forNodes: [{ name: 'node-1' }] },
          },
        ],
      },
      true
    );
  });

  it.each([
    ['an empty endpoints list', { endpoints: [] }],
    ['no endpoints field', { endpoints: undefined }],
  ])('accepts a slice with %s', (_label, overrides) => {
    expectValidity({ ...exampleSlice, ...overrides }, true);
  });

  it('starts invalid from the base object until an address is entered', () => {
    const base = {
      metadata: { name: 'example-abc' },
      addressType: 'IPv4',
      ports: [{ name: 'http', port: 80, protocol: 'TCP' }],
      endpoints: [baseEndpoint],
    };
    expectValidity(base, false);
    expectValidity({ ...base, endpoints: [{ ...baseEndpoint, addresses: ['10.1.2.3'] }] }, true);
  });

  it.each([
    ['there is no name', { metadata: { name: '' } }],
    ['the address type is missing', { addressType: undefined }],
    ['the address type is unknown', { addressType: 'Bogus' }],
    ['an endpoint has no addresses', { endpoints: [{ addresses: [] }] }],
    ['an address does not match the address type', { addressType: 'IPv6' }],
    ['an address is a loopback IP', { endpoints: [{ addresses: ['127.0.0.1'] }] }],
    [
      'a hostname is not a DNS-1123 label',
      { endpoints: [{ addresses: ['10.1.2.3'], hostname: 'Pod_1' }] },
    ],
    ['a nodeName is empty', { endpoints: [{ addresses: ['10.1.2.3'], nodeName: '' }] }],
    [
      'a condition is not a boolean',
      { endpoints: [{ addresses: ['10.1.2.3'], conditions: { ready: 'yes' } }] },
    ],
    [
      'YAML hints have more than eight zones',
      {
        endpoints: [
          {
            addresses: ['10.1.2.3'],
            hints: { forZones: Array.from({ length: 9 }, (_v, i) => ({ name: `zone-${i}` })) },
          },
        ],
      },
    ],
    [
      'a YAML zone hint is not a valid label value',
      { endpoints: [{ addresses: ['10.1.2.3'], hints: { forZones: [{ name: 'bad zone' }] } }] },
    ],
    [
      'a YAML node hint is not a valid node name',
      { endpoints: [{ addresses: ['10.1.2.3'], hints: { forNodes: [{ name: 'Node_1' }] } }] },
    ],
    [
      'port names are duplicated',
      {
        ports: [
          { name: 'http', port: 80 },
          { name: 'http', port: 81 },
        ],
      },
    ],
    [
      'the Service label is not a valid label value',
      { metadata: { name: 'example-abc', labels: { [SERVICE_NAME_LABEL]: 'bad name' } } },
    ],
  ])('is invalid when %s', (_label, overrides) => {
    expectValidity({ ...exampleSlice, ...overrides }, false);
  });

  it('writes the Service field to the kubernetes.io/service-name label', () => {
    const onChange = vi.fn();
    const { getByRole } = renderForm({ metadata: { name: 'example-abc' } }, undefined, onChange);

    fireEvent.change(getByRole('textbox', { name: 'Service' }), { target: { value: 'example' } });

    expect(onChange).toHaveBeenLastCalledWith({
      metadata: { name: 'example-abc', labels: { [SERVICE_NAME_LABEL]: 'example' } },
    });
  });
});

describe('EndpointSliceEndpointsField', () => {
  it('groups each endpoint and its lists with distinct accessible names', () => {
    const { getByRole, getByLabelText } = render(
      <EndpointSliceEndpointsField
        value={exampleSlice.endpoints}
        addressType="IPv4"
        onChange={() => {}}
      />
    );

    expect(getByRole('group', { name: 'Endpoint 1' })).toBeInTheDocument();
    expect(getByRole('group', { name: 'Endpoint 1 Addresses' })).toBeInTheDocument();
    expect(getByRole('group', { name: 'Endpoint 1 Conditions' })).toBeInTheDocument();
    expect(getByLabelText('Endpoint 1 Addresses 1 Address')).toHaveValue('10.1.2.3');
    expect(getByLabelText('Endpoint 1 Hostname')).toHaveValue('pod-1');
    expect(getByLabelText('Endpoint 1 Node Name')).toHaveValue('node-1');
    expect(getByLabelText('Endpoint 1 Zone')).toHaveValue('us-west2-a');
    expect(getByRole('checkbox', { name: 'Endpoint 1 Ready' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'Endpoint 1 Serving' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'Endpoint 1 Terminating' })).not.toBeChecked();
  });

  it('renders omitted conditions with the API defaults', () => {
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3'] }]}
        addressType="IPv4"
        onChange={() => {}}
      />
    );

    expect(getByRole('checkbox', { name: 'Endpoint 1 Ready' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'Endpoint 1 Serving' })).toBeChecked();
    expect(getByRole('checkbox', { name: 'Endpoint 1 Terminating' })).not.toBeChecked();
  });

  it('renders explicit false conditions as unchecked', () => {
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3'], conditions: { ready: false, serving: false } }]}
        addressType="IPv4"
        onChange={() => {}}
      />
    );

    expect(getByRole('checkbox', { name: 'Endpoint 1 Ready' })).not.toBeChecked();
    expect(getByRole('checkbox', { name: 'Endpoint 1 Serving' })).not.toBeChecked();
  });

  it('writes an explicit false when unchecking a defaulted condition', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3'], conditions: { ready: true } }]}
        addressType="IPv4"
        onChange={onChange}
      />
    );

    fireEvent.click(getByRole('checkbox', { name: 'Endpoint 1 Serving' }));

    expect(onChange).toHaveBeenCalledWith([
      { addresses: ['10.1.2.3'], conditions: { ready: true, serving: false } },
    ]);
  });

  it('adds an endpoint with the same defaults as EndpointSlice.getBaseObject', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSliceEndpointsField value={undefined} addressType="IPv4" onChange={onChange} />
    );

    fireEvent.click(getByRole('button', { name: 'Add endpoint' }));

    expect(onChange).toHaveBeenCalledWith([baseEndpoint]);
  });

  it('unsets a text field when it is cleared', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3'], hostname: 'pod-1' }]}
        addressType="IPv4"
        onChange={onChange}
      />
    );

    fireEvent.change(getByLabelText('Endpoint 1 Hostname'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith([{ addresses: ['10.1.2.3'] }]);
  });

  it('toggles a condition without dropping the others', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3'], conditions: { ready: true } }]}
        addressType="IPv4"
        onChange={onChange}
      />
    );

    fireEvent.click(getByRole('checkbox', { name: 'Endpoint 1 Terminating' }));

    expect(onChange).toHaveBeenCalledWith([
      { addresses: ['10.1.2.3'], conditions: { ready: true, terminating: true } },
    ]);
  });

  it('adds and removes addresses within an endpoint', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: ['10.1.2.3', '10.1.2.4'] }]}
        addressType="IPv4"
        onChange={onChange}
      />
    );

    fireEvent.click(getByRole('button', { name: 'Endpoint 1 New Address' }));
    expect(onChange).toHaveBeenLastCalledWith([{ addresses: ['10.1.2.3', '10.1.2.4', ''] }]);

    fireEvent.click(getByRole('button', { name: 'Endpoint 1 Addresses 1 Remove address' }));
    expect(onChange).toHaveBeenLastCalledWith([{ addresses: ['10.1.2.4'] }]);
  });

  it.each([
    ['2001:db8::1', 'IPv4', /enter a valid ipv4 address/i],
    ['10.1.2.3', 'IPv6', /enter a valid ipv6 address/i],
    ['127.0.0.1', 'IPv4', /loopback addresses/i],
    ['backend', 'FQDN', /fully qualified domain name/i],
  ])('flags %s for addressType %s with an explanation', (address, addressType, message) => {
    const { getByLabelText } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: [address] }]}
        addressType={addressType}
        onChange={() => {}}
      />
    );

    const input = getByLabelText('Endpoint 1 Addresses 1 Address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(message);
  });

  it.each([
    ['10.1.2.3', 'IPv4'],
    ['', 'IPv4'],
    ['backend.example.com', 'FQDN'],
  ])('does not flag "%s" for addressType %s', (address, addressType) => {
    const { getByLabelText } = render(
      <EndpointSliceEndpointsField
        value={[{ addresses: [address] }]}
        addressType={addressType}
        onChange={() => {}}
      />
    );

    const input = getByLabelText('Endpoint 1 Addresses 1 Address');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAccessibleDescription();
  });

  it('tolerates partial YAML array entries', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSliceEndpointsField
        value={[undefined] as any}
        addressType="IPv4"
        onChange={onChange}
      />
    );

    fireEvent.click(getByRole('button', { name: 'Endpoint 1 New Address' }));

    expect(onChange).toHaveBeenCalledWith([{ addresses: [''] }]);
  });
});

describe('EndpointSlicePortsField', () => {
  it('adds an unnamed TCP port', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSlicePortsField value={exampleSlice.ports} onChange={onChange} />
    );

    fireEvent.click(getByRole('button', { name: 'Add port' }));

    expect(onChange).toHaveBeenCalledWith([
      ...exampleSlice.ports,
      { name: '', port: 80, protocol: 'TCP' },
    ]);
  });

  it('unsets the port number when cleared and ignores out-of-range values', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <EndpointSlicePortsField value={[{ name: 'http', port: 80 }]} onChange={onChange} />
    );

    fireEvent.change(getByLabelText('Ports 1 Port'), { target: { value: '65536' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(getByLabelText('Ports 1 Port'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith([{ name: 'http' }]);
  });
});
