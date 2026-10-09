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

const { default: CreateEndpointsForm } = await import('./CreateEndpointsForm');
const { EndpointSubsetsField } = await import('./EndpointSubsetsField');
const { getEndpointIPIssue, isValidEndpointHostname, isValidEndpointIP, isValidQualifiedName } =
  await import('./endpointsValidation');

describe('isValidQualifiedName', () => {
  it.each([
    'http',
    'HTTP2',
    'grpc_web',
    'my.protocol',
    'kubernetes.io/h2c',
    'example.com/My_Proto',
    'a'.repeat(63),
  ])('accepts qualified name %s', name => {
    expect(isValidQualifiedName(name)).toBe(true);
  });

  it.each([
    '', // empty
    'bad value', // whitespace
    '-http', // must start with an alphanumeric
    'http_', // must end with an alphanumeric
    '/http', // empty prefix
    'Example.com/http', // prefix must be a lowercase DNS-1123 subdomain
    'example.com/', // empty name part
    'a/b/c', // more than one '/'
    'a'.repeat(64), // name part longer than 63 characters
  ])('rejects invalid qualified name "%s"', name => {
    expect(isValidQualifiedName(name)).toBe(false);
  });
});

describe('isValidEndpointHostname', () => {
  it.each(['web', 'web-0', '0', 'a1-b2', 'a'.repeat(63)])('accepts DNS-1123 label %s', name => {
    expect(isValidEndpointHostname(name)).toBe(true);
  });

  it.each([
    'INVALID_NAME', // uppercase and underscore
    'Web', // uppercase
    'web.example', // dots are not allowed in a label
    '-web', // must start with an alphanumeric
    'web-', // must end with an alphanumeric
    'web 0', // whitespace
    'a'.repeat(64), // longer than 63 characters
  ])('rejects non-DNS-1123 label %s', name => {
    expect(isValidEndpointHostname(name)).toBe(false);
  });
});

describe('isValidEndpointIP', () => {
  it.each(['10.0.0.1', '192.168.1.5', '2001:db8::1', '64:ff9b::cb00:7105'])(
    'accepts routable address %s',
    ip => {
      expect(isValidEndpointIP(ip)).toBe(true);
    }
  );

  it.each(['not-an-ip', '', '10.0.0.256', '10.0.0', '1.2.3.4.5', ' 10.0.0.1', 'fe80::1%eth0'])(
    'rejects malformed address %s',
    ip => {
      expect(isValidEndpointIP(ip)).toBe(false);
    }
  );

  it.each([
    '::ffff:203.0.113.5', // dotted form
    '::ffff:cb00:7105', // hex form of the same address
    '0:0:0:0:0:ffff:203.0.113.5', // fully expanded
    '::FFFF:203.0.113.5', // uppercase hex
    '::ffff:127.0.0.1', // mapped loopback
  ])('rejects IPv4-mapped IPv6 address %s', ip => {
    expect(isValidEndpointIP(ip)).toBe(false);
  });

  it.each([
    '0.0.0.0', // unspecified
    '127.0.0.1', // loopback
    '169.254.10.20', // link-local unicast
    '224.0.0.5', // link-local multicast
    '::', // IPv6 unspecified
    '::1', // IPv6 loopback
    'fe80::1', // IPv6 link-local unicast
    'ff02::1', // IPv6 link-local multicast
  ])('rejects special-range address %s', ip => {
    expect(isValidEndpointIP(ip)).toBe(false);
  });
});

describe('getEndpointIPIssue', () => {
  it.each([
    ['10.0.0.1', null],
    ['2001:db8::1', null],
    ['not-an-ip', 'malformed'],
    ['10.0.0.256', 'malformed'],
    ['::ffff:203.0.113.5', 'ipv4-mapped'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'unspecified'],
    ['127.0.0.1', 'loopback'],
    ['::1', 'loopback'],
    ['169.254.10.20', 'link-local'],
    ['fe80::1', 'link-local'],
    ['224.0.0.5', 'link-local-multicast'],
    ['ff02::1', 'link-local-multicast'],
    ['ff12::1', 'link-local-multicast'], // transient flag, still link-local scope
    ['ff05::1', null], // site-local scope multicast is allowed
  ])('reports %s as %s', (ip, issue) => {
    expect(getEndpointIPIssue(ip)).toBe(issue);
  });
});

describe('CreateEndpointsForm', () => {
  function renderForm(resource: any, onValidChange: ReturnType<typeof vi.fn>) {
    return render(
      <CreateEndpointsForm resource={resource} onChange={() => {}} onValidChange={onValidChange} />
    );
  }

  const validSubset = { addresses: [{ ip: '10.0.0.1' }], ports: [{ port: 80 }] };

  it('is invalid without a name', () => {
    const onValidChange = vi.fn();
    renderForm({ subsets: [validSubset] }, onValidChange);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it('is invalid when a subset has no addresses', () => {
    const onValidChange = vi.fn();
    renderForm({ metadata: { name: 'backend' }, subsets: [{}] }, onValidChange);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it('is invalid when an address has an empty IP', () => {
    const onValidChange = vi.fn();
    renderForm(
      {
        metadata: { name: 'backend' },
        subsets: [{ addresses: [{ ip: '' }], ports: [{ port: 80 }] }],
      },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it.each(['not-an-ip', '127.0.0.1', '0.0.0.0', '169.254.1.1', '::ffff:203.0.113.5'])(
    'is invalid when an address IP is %s',
    ip => {
      const onValidChange = vi.fn();
      renderForm(
        {
          metadata: { name: 'backend' },
          subsets: [{ addresses: [{ ip }], ports: [{ port: 80 }] }],
        },
        onValidChange
      );
      expect(onValidChange).toHaveBeenLastCalledWith(false);
    }
  );

  it.each([
    ['ready', 'addresses'],
    ['not-ready', 'notReadyAddresses'],
  ])('is invalid when a %s address has a non-DNS-1123 hostname', (_label, field) => {
    const onValidChange = vi.fn();
    renderForm(
      {
        metadata: { name: 'backend' },
        subsets: [
          { [field]: [{ ip: '10.0.0.1', hostname: 'INVALID_NAME' }], ports: [{ port: 80 }] },
        ],
      },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it.each(['', 'web-0'])('is valid when an address hostname is "%s"', hostname => {
    const onValidChange = vi.fn();
    renderForm(
      {
        metadata: { name: 'backend' },
        subsets: [{ addresses: [{ ip: '10.0.0.1', hostname }], ports: [{ port: 80 }] }],
      },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });

  it.each([
    ['a single port named HTTP', [{ name: 'HTTP', port: 80 }]],
    ['a port name with an underscore', [{ name: 'my_port', port: 80 }]],
    ['an appProtocol of "bad value"', [{ appProtocol: 'bad value', port: 80 }]],
    ['an empty appProtocol', [{ appProtocol: '', port: 80 }]],
    ['multiple ports with a missing name', [{ name: 'http', port: 80 }, { port: 443 }]],
    ['an unsupported protocol', [{ port: 80, protocol: 'BOGUS' }]],
  ])('is invalid with %s', (_label, ports) => {
    const onValidChange = vi.fn();
    renderForm(
      { metadata: { name: 'backend' }, subsets: [{ addresses: [{ ip: '10.0.0.1' }], ports }] },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    [
      'an unnamed single port with the default appProtocol',
      [{ name: '', appProtocol: 'http', port: 80 }],
    ],
    ['a prefixed appProtocol', [{ name: 'web', appProtocol: 'kubernetes.io/h2c', port: 80 }]],
    [
      'multiple named ports',
      [
        { name: 'http', port: 80 },
        { name: 'https', port: 443 },
      ],
    ],
  ])('is valid with %s', (_label, ports) => {
    const onValidChange = vi.fn();
    renderForm(
      { metadata: { name: 'backend' }, subsets: [{ addresses: [{ ip: '10.0.0.1' }], ports }] },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });

  it('is invalid when a present port has no port number', () => {
    const onValidChange = vi.fn();
    renderForm(
      {
        metadata: { name: 'backend' },
        subsets: [{ addresses: [{ ip: '10.0.0.1' }], ports: [{ name: 'http' }] }],
      },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false);
  });

  it('is valid with a name and a fully-specified subset', () => {
    const onValidChange = vi.fn();
    renderForm({ metadata: { name: 'backend' }, subsets: [validSubset] }, onValidChange);
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });

  it('is valid when only not-ready addresses are provided', () => {
    const onValidChange = vi.fn();
    renderForm(
      {
        metadata: { name: 'backend' },
        subsets: [{ notReadyAddresses: [{ ip: '10.0.0.9' }], ports: [{ port: 80 }] }],
      },
      onValidChange
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });
});

describe('EndpointSubsetsField', () => {
  it('groups each subset and its address/port lists with distinct accessible names', () => {
    const onChange = vi.fn();
    const value = [
      {
        addresses: [{ hostname: 'ready', ip: '10.0.0.1' }],
        notReadyAddresses: [{ hostname: 'waiting', ip: '10.0.0.2' }],
        ports: [{ name: 'http', appProtocol: 'http', port: 80, protocol: 'TCP' }],
      },
    ];
    const { getByRole, getByLabelText } = render(
      <EndpointSubsetsField value={value} onChange={onChange} />
    );

    // Each list is a labelled group carrying both the subset number and its context.
    expect(getByRole('group', { name: 'Subset 1' })).toBeInTheDocument();
    expect(getByRole('group', { name: 'Subset 1 Addresses' })).toBeInTheDocument();
    expect(getByRole('group', { name: 'Subset 1 Not Ready Addresses' })).toBeInTheDocument();
    expect(getByRole('group', { name: 'Subset 1 Ports' })).toBeInTheDocument();

    // Controls that would otherwise share a name are now distinguishable.
    expect(getByLabelText('Subset 1 Addresses 1 IP')).toBeInTheDocument();
    expect(getByLabelText('Subset 1 Not Ready Addresses 1 IP')).toBeInTheDocument();
    expect(getByLabelText('Subset 1 Ports 1 Port')).toBeInTheDocument();
  });

  it('adds a subset with the same defaults as Endpoints.getBaseObject', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<EndpointSubsetsField value={undefined} onChange={onChange} />);

    fireEvent.click(getByRole('button', { name: 'Add subset' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        addresses: [{ hostname: '', ip: '' }],
        ports: [{ name: '', appProtocol: 'http', port: 80, protocol: 'TCP' }],
      },
    ]);
  });

  it('updates ready and not-ready addresses independently', () => {
    const onChange = vi.fn();
    const value = [
      {
        addresses: [{ hostname: 'ready', ip: '10.0.0.1' }],
        notReadyAddresses: [{ hostname: 'waiting', ip: '10.0.0.2' }],
      },
    ];
    const { getAllByLabelText } = render(
      <EndpointSubsetsField value={value} onChange={onChange} />
    );

    fireEvent.change(getAllByLabelText('IP')[1], { target: { value: '10.0.0.3' } });

    expect(onChange).toHaveBeenCalledWith([
      {
        addresses: [{ hostname: 'ready', ip: '10.0.0.1' }],
        notReadyAddresses: [{ hostname: 'waiting', ip: '10.0.0.3' }],
      },
    ]);
  });

  it('tolerates partial YAML array entries', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <EndpointSubsetsField value={[undefined] as any} onChange={onChange} />
    );

    fireEvent.click(getByRole('button', { name: 'Subset 1 New Address' }));

    expect(onChange).toHaveBeenCalledWith([{ addresses: [{ hostname: '', ip: '' }] }]);
  });

  it('ignores endpoint ports outside the Kubernetes range', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <EndpointSubsetsField
        value={[{ ports: [{ port: 80, protocol: 'TCP' }] }]}
        onChange={onChange}
      />
    );

    fireEvent.change(getByLabelText('Port'), { target: { value: '65536' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['127.0.0.1', /loopback addresses/i],
    ['169.254.1.1', /link-local addresses/i],
    ['0.0.0.0', /unspecified addresses/i],
    ['ff12::1', /ipv6 multicast with link-local scope, ffx2::/i],
    ['::ffff:10.0.0.1', /ipv4-mapped ipv6 addresses/i],
    ['10.0.0.256', /enter a valid ipv4 or ipv6 address/i],
  ])('flags the IP field with an explanation for %s', (ip, message) => {
    const { getByLabelText } = render(
      <EndpointSubsetsField value={[{ addresses: [{ ip }] }]} onChange={() => {}} />
    );

    const input = getByLabelText('Subset 1 Addresses 1 IP');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(message);
  });

  it.each(['10.0.0.1', ''])('does not flag the IP field for "%s"', ip => {
    const { getByLabelText } = render(
      <EndpointSubsetsField value={[{ addresses: [{ ip }] }]} onChange={() => {}} />
    );

    const input = getByLabelText('Subset 1 Addresses 1 IP');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAccessibleDescription();
  });
});
