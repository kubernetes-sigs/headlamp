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

import '../../../../i18n/config';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Avoid pulling the lib/k8s barrel (and its circular ResourceClasses chain) into
// the test. ContainerTextField does not use Namespace, but CreateResourceForm
// imports it for NamespaceTextField, which is enough to trigger the cycle.
vi.mock('../../../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { ContainerTextField } = await import('./workloadFields');
const { ServicePortsTextField } = await import('./CreateResourceForm');

function renderContainers(value: unknown) {
  return render(<ContainerTextField value={value as any} onChange={() => {}} />);
}

// Reproduces the YAML-editor edit paths from #5780. The Create dialog mounts the
// form panel even while the user is typing in the editor tab, so any partial
// shape js-yaml hands back has to render without throwing.
describe('ContainerTextField partial-input tolerance', () => {
  it('renders a null sequence entry without crashing (containers:\\n  -)', () => {
    expect(() => renderContainers([null])).not.toThrow();
  });

  it('renders a mix of valid and null entries without crashing', () => {
    expect(() =>
      renderContainers([{ name: 'c1', image: 'nginx', ports: [{ containerPort: 80 }] }, null])
    ).not.toThrow();
  });

  it('renders when value is a string instead of an array (containers: foo)', () => {
    expect(() => renderContainers('foo')).not.toThrow();
  });

  it('renders when value is null', () => {
    expect(() => renderContainers(null)).not.toThrow();
  });

  it('renders fully-populated entries as before', () => {
    const { getAllByRole } = renderContainers([
      { name: 'c1', image: 'nginx', ports: [{ containerPort: 80 }], imagePullPolicy: 'Always' },
    ]);
    expect(getAllByRole('textbox').length).toBeGreaterThan(0);
  });
});

// Mirrors the same YAML-editor tolerance guarantee for the Service ports editor:
// while the user types, js-yaml may hand us [null], strings, or `null` — none of
// those may crash the form.
describe('ServicePortsTextField partial-input tolerance', () => {
  function renderPorts(value: unknown, onChange: (ports: any[]) => void = () => {}) {
    return render(<ServicePortsTextField value={value as any} onChange={onChange} />);
  }

  it('renders a null sequence entry without crashing (ports:\\n  -)', () => {
    expect(() => renderPorts([null])).not.toThrow();
  });

  it('renders when value is null', () => {
    expect(() => renderPorts(null)).not.toThrow();
  });

  it('renders when value is a string instead of an array', () => {
    expect(() => renderPorts('foo')).not.toThrow();
  });

  it('renders the default Service port row from getBaseObject', () => {
    const { getAllByDisplayValue, getByDisplayValue } = renderPorts([
      { name: '', nodePort: 30000, port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
    // Port and Target Port both render "80".
    expect(getAllByDisplayValue('80')).toHaveLength(2);
    expect(getByDisplayValue('30000')).toBeTruthy();
  });

  it('emits a numeric port when the user edits the Port input', () => {
    const handleChange = vi.fn();
    const { getAllByRole } = renderPorts(
      [{ name: '', nodePort: 30000, port: 80, protocol: 'TCP', targetPort: 80 }],
      handleChange
    );
    // Row order: Name (text), Port (number), TargetPort (text), NodePort (number).
    const spinButtons = getAllByRole('spinbutton');
    fireEvent.change(spinButtons[0], { target: { value: '8080' } });
    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({ port: 8080, protocol: 'TCP' }),
    ]);
  });

  it('preserves a named targetPort (string) instead of coercing to a number', () => {
    const handleChange = vi.fn();
    const { getAllByRole } = renderPorts(
      [{ name: '', nodePort: 30000, port: 80, protocol: 'TCP', targetPort: 80 }],
      handleChange
    );
    // Row order: Name (text), Port (number), TargetPort (text), NodePort (number).
    // targetPort accepts named strings, so it renders as a text input.
    const textInputs = getAllByRole('textbox');
    // Name is [0], TargetPort is [1].
    fireEvent.change(textInputs[1], { target: { value: 'http' } });
    expect(handleChange).toHaveBeenCalledWith([expect.objectContaining({ targetPort: 'http' })]);
  });

  it('adds a new port row when the New Port button is clicked', () => {
    const handleChange = vi.fn();
    const { getByLabelText } = renderPorts([], handleChange);
    fireEvent.click(getByLabelText('Add port'));
    expect(handleChange).toHaveBeenCalledWith([
      { name: '', nodePort: 30000, port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
  });
});
