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

const { default: CreateEndpointsForm, EndpointSubsetsField } = await import(
  './CreateEndpointsForm'
);

describe('CreateEndpointsForm', () => {
  it('requires a name and at least one subset', () => {
    const onValidChange = vi.fn();
    const { rerender } = render(
      <CreateEndpointsForm resource={{}} onChange={() => {}} onValidChange={onValidChange} />
    );

    expect(onValidChange).toHaveBeenLastCalledWith(false);

    rerender(
      <CreateEndpointsForm
        resource={{ metadata: { name: 'backend' }, subsets: [{}] }}
        onChange={() => {}}
        onValidChange={onValidChange}
      />
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true);
  });
});

describe('EndpointSubsetsField', () => {
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
