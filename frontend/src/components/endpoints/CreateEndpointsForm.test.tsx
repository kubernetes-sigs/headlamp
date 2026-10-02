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

const {
  default: CreateEndpointsForm,
  EndpointSubsetsField,
  isValidEndpointIP,
} = await import('./CreateEndpointsForm');

describe('isValidEndpointIP', () => {
  it.each(['10.0.0.1', '192.168.1.5', '2001:db8::1', '::ffff:203.0.113.5'])(
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
    '0.0.0.0', // unspecified
    '127.0.0.1', // loopback
    '169.254.10.20', // link-local unicast
    '224.0.0.5', // link-local multicast
    '::', // IPv6 unspecified
    '::1', // IPv6 loopback
    'fe80::1', // IPv6 link-local unicast
    'ff02::1', // IPv6 link-local multicast
    '::ffff:127.0.0.1', // IPv4-mapped loopback
  ])('rejects special-range address %s', ip => {
    expect(isValidEndpointIP(ip)).toBe(false);
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

  it.each(['not-an-ip', '127.0.0.1', '0.0.0.0', '169.254.1.1'])(
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

    fireEvent.click(getByRole('button', { name: 'New Address' }));

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
});
