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
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormSection } from './CreateResourceForm';

// Avoid pulling the lib/k8s barrel (and its circular ResourceClasses chain) into
// the test. ContainerTextField does not use Namespace, but CreateResourceForm
// imports it for NamespaceTextField, which is enough to trigger the cycle.
vi.mock('../../../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { ContainerTextField } = await import('./workloadFields');
const { ServicePortsTextField } = await import('./CreateResourceForm');
const { default: CreateResourceForm } = await import('./index');
const { default: CreatePodForm } = await import('../../../pod/CreatePodForm');
const { default: CreateDeploymentForm } = await import('../../../deployments/CreateDeploymentForm');

describe('Container port validation feedback', () => {
  it.each([
    { name: 'string ports', ports: 'invalid' },
    { name: 'empty string ports', ports: '' },
    { name: 'object ports', ports: { containerPort: 80 } },
    { name: 'numeric ports', ports: 0 },
    { name: 'boolean ports', ports: false },
    { name: 'null first port', ports: [null] },
  ])('rejects $name and displays a port error', ({ ports }) => {
    const onValidChange = vi.fn();
    render(
      <CreatePodForm
        resource={{
          metadata: { name: 'port-validation', namespace: 'default' },
          spec: { containers: [{ name: 'app', image: 'nginx', ports }] },
        }}
        onChange={() => {}}
        onValidChange={onValidChange}
      />
    );

    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText('Container port').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Please enter a valid port number (1-65535).')).toBeDefined();
  });

  it.each([
    { name: 'incomplete second port', ports: [{ containerPort: 80 }, { name: 'metrics' }] },
    { name: 'null second port', ports: [{ containerPort: 80 }, null] },
    { name: 'out-of-range second port', ports: [{ containerPort: 80 }, { containerPort: 65536 }] },
  ])('directs users to repair $name in the Editor tab', ({ ports }) => {
    let resource: Record<string, any> = {
      metadata: { name: 'port-validation', namespace: 'default' },
      spec: { containers: [{ name: 'app', image: 'nginx', ports }] },
    };
    const onChange = vi.fn(next => {
      resource = next;
    });
    const onValidChange = vi.fn();
    const form = () => (
      <CreatePodForm resource={resource} onChange={onChange} onValidChange={onValidChange} />
    );
    const { rerender } = render(form());
    const portInput = screen.getByLabelText('Container port') as HTMLInputElement;

    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(portInput.value).toBe('80');
    expect(portInput.getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByRole('alert').textContent).toBe(
      'Port 2 is invalid. Fix it in the Editor tab.'
    );
    expect(screen.queryByText('Please enter a valid port number (1-65535).')).toBeNull();

    // Editing the valid first port cannot repair the preserved second entry.
    fireEvent.change(portInput, { target: { value: '8080' } });
    rerender(form());
    expect(portInput.getAttribute('aria-invalid')).toBe('false');
    expect(resource.spec.containers[0].ports[1]).toEqual(ports[1]);
    expect(onValidChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('alert').textContent).toBe(
      'Port 2 is invalid. Fix it in the Editor tab.'
    );

    // The Editor tab supplies the complete resource after repairing the second port.
    resource = {
      ...resource,
      spec: {
        ...resource.spec,
        containers: [
          {
            ...resource.spec.containers[0],
            ports: [resource.spec.containers[0].ports[0], { name: 'metrics', containerPort: 9090 }],
          },
        ],
      },
    };
    rerender(form());
    expect(onValidChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(portInput.value).toBe('8080');
  });

  it('identifies every invalid secondary port separately from the first-port error', () => {
    renderContainers([
      { name: 'app', image: 'nginx', ports: [{ name: 'http' }, null, { containerPort: 65536 }] },
    ]);

    expect(screen.getByLabelText('Container port').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Please enter a valid port number (1-65535).')).toBeDefined();
    expect(screen.getAllByRole('alert').map(alert => alert.textContent)).toEqual([
      'Port 2 is invalid. Fix it in the Editor tab.',
      'Port 3 is invalid. Fix it in the Editor tab.',
    ]);
  });

  it.each([
    { name: 'absent ports', ports: undefined },
    { name: 'null ports', ports: null },
    { name: 'empty ports', ports: [] },
    { name: 'valid first port', ports: [{ containerPort: 1 }] },
    { name: 'valid multiple ports', ports: [{ containerPort: 80 }, { containerPort: 65535 }] },
  ])('accepts $name without a port error', ({ ports }) => {
    const onValidChange = vi.fn();
    render(
      <CreatePodForm
        resource={{
          metadata: { name: 'port-validation', namespace: 'default' },
          spec: { containers: [{ name: 'app', image: 'nginx', ports }] },
        }}
        onChange={() => {}}
        onValidChange={onValidChange}
      />
    );

    expect(onValidChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Container port').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Please enter a valid port number (1-65535).')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

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
  function renderPorts(
    value: unknown,
    onChange: (ports: any[]) => void = () => {},
    showNodePort?: boolean
  ) {
    return render(
      <ServicePortsTextField value={value as any} onChange={onChange} showNodePort={showNodePort} />
    );
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
    const { getAllByDisplayValue } = renderPorts([
      { name: '', port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
    // Port and Target Port both render "80".
    expect(getAllByDisplayValue('80')).toHaveLength(2);
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

  it('adds a new port row without nodePort by default (showNodePort defaults to true, but hidden case)', () => {
    const handleChange = vi.fn();
    const { getByLabelText } = renderPorts([], handleChange, false);
    fireEvent.click(getByLabelText('Add port'));
    expect(handleChange).toHaveBeenCalledWith([
      { name: '', port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
  });

  it('leaves nodePort empty on a new port row so Kubernetes assigns one', () => {
    const handleChange = vi.fn();
    const { getByLabelText } = renderPorts([], handleChange, true);
    fireEvent.click(getByLabelText('Add port'));
    expect(handleChange).toHaveBeenCalledWith([
      { name: '', port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
  });

  it('hides the Node Port column when showNodePort is false', () => {
    const { queryByLabelText } = renderPorts(
      [{ name: '', port: 80, protocol: 'TCP', targetPort: 80 }],
      () => {},
      false
    );
    expect(queryByLabelText('Node Port')).toBeNull();
  });

  it('strips nodePort from ports when showNodePort is false', () => {
    const handleChange = vi.fn();
    renderPorts(
      [{ name: '', nodePort: 30000, port: 80, protocol: 'TCP', targetPort: 80 }],
      handleChange,
      false
    );
    expect(handleChange).toHaveBeenCalledWith([
      { name: '', port: 80, protocol: 'TCP', targetPort: 80 },
    ]);
  });
});

const makeSelectSections = (multiple?: boolean): FormSection[] => [
  {
    title: 'Test',
    fields: [
      {
        key: 'mode',
        path: 'spec.mode',
        label: 'Mode',
        type: 'select',
        multiple,
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    ],
  },
];

const makeNumericSelectSections = (multiple?: boolean): FormSection[] => [
  {
    title: 'Test',
    fields: [
      {
        key: 'port',
        path: 'spec.port',
        label: 'Port',
        type: 'select',
        multiple,
        options: [
          { value: '0', label: 'Port 0' },
          { value: '80', label: 'Port 80' },
        ],
      },
    ],
  },
];

describe('CreateResourceForm – select field', () => {
  describe('single-select (multiple: false)', () => {
    it('renders with a string value without crashing', () => {
      expect(() =>
        render(
          <CreateResourceForm
            sections={makeSelectSections()}
            resource={{ spec: { mode: 'a' } }}
            onChange={() => {}}
          />
        )
      ).not.toThrow();
    });

    it('calls onChange with a string value when an option is selected', () => {
      const onChange = vi.fn();
      render(
        <CreateResourceForm sections={makeSelectSections()} resource={{}} onChange={onChange} />
      );
      fireEvent.mouseDown(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Option A'));
      const updated = onChange.mock.calls.at(-1)?.[0];
      expect(typeof updated.spec.mode).toBe('string');
      expect(updated.spec.mode).toBe('a');
    });
  });

  describe('multi-select (multiple: true)', () => {
    it('renders with an array value without crashing', () => {
      expect(() =>
        render(
          <CreateResourceForm
            sections={makeSelectSections(true)}
            resource={{ spec: { mode: ['a', 'b'] } }}
            onChange={() => {}}
          />
        )
      ).not.toThrow();
    });

    it('normalizes a bare string value to an array without crashing', () => {
      expect(() =>
        render(
          <CreateResourceForm
            sections={makeSelectSections(true)}
            resource={{ spec: { mode: 'a' } }}
            onChange={() => {}}
          />
        )
      ).not.toThrow();
    });

    it('calls onChange with an array when an option is selected', () => {
      const onChange = vi.fn();
      render(
        <CreateResourceForm sections={makeSelectSections(true)} resource={{}} onChange={onChange} />
      );
      fireEvent.mouseDown(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Option A'));
      const updated = onChange.mock.calls.at(-1)?.[0];
      expect(Array.isArray(updated.spec.mode)).toBe(true);
      expect(updated.spec.mode).toContain('a');
    });

    it('wraps a single autofill string into a one-element array', () => {
      const onChange = vi.fn();
      render(
        <CreateResourceForm sections={makeSelectSections(true)} resource={{}} onChange={onChange} />
      );
      const nativeSelect = document.querySelector('.MuiSelect-nativeInput') as HTMLInputElement;
      fireEvent.change(nativeSelect, { target: { value: 'b' } });
      const updated = onChange.mock.calls.at(-1)?.[0];
      expect(updated.spec.mode).toEqual(['b']);
    });

    it('treats an empty string as absent and produces [] in multi-select', () => {
      expect(() =>
        render(
          <CreateResourceForm
            sections={makeNumericSelectSections(true)}
            resource={{ spec: { port: '' } }}
            onChange={() => {}}
          />
        )
      ).not.toThrow();
    });

    it('wraps a falsy numeric-string value ("0") into a one-element array, not []', () => {
      expect(() =>
        render(
          <CreateResourceForm
            sections={makeNumericSelectSections(true)}
            resource={{ spec: { port: '0' } }}
            onChange={() => {}}
          />
        )
      ).not.toThrow();
    });

    it('renders the option label in chips, not the raw stored value', () => {
      render(
        <CreateResourceForm
          sections={makeSelectSections(true)}
          resource={{ spec: { mode: ['a', 'b'] } }}
          onChange={() => {}}
        />
      );
      expect(screen.getByText('Option A')).toBeDefined();
      expect(screen.getByText('Option B')).toBeDefined();
      expect(screen.queryByText('a')).toBeNull();
      expect(screen.queryByText('b')).toBeNull();
    });
  });
});

describe('ContainerTextField port edit preservation', () => {
  const makeReproContainer = () => ({
    name: 'app',
    image: 'nginx:alpine',
    imagePullPolicy: 'IfNotPresent',
    command: ['sh', '-c', 'sleep 3600'],
    env: [{ name: 'KEEP_ME', value: 'unchanged' }],
    ports: [
      {
        name: 'dns',
        containerPort: 5353,
        protocol: 'UDP',
        hostPort: 5353,
        hostIP: '127.0.0.1',
      },
      {
        name: 'metrics',
        containerPort: 9090,
        protocol: 'TCP',
      },
    ],
  });

  it('preserves first-port metadata and the second port when editing containerPort', () => {
    const handleChange = vi.fn();
    const initialContainers = [makeReproContainer()];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '5354' } });

    expect(handleChange).toHaveBeenCalledWith([
      {
        name: 'app',
        image: 'nginx:alpine',
        imagePullPolicy: 'IfNotPresent',
        command: ['sh', '-c', 'sleep 3600'],
        env: [{ name: 'KEEP_ME', value: 'unchanged' }],
        ports: [
          {
            name: 'dns',
            containerPort: 5354,
            protocol: 'UDP',
            hostPort: 5353,
            hostIP: '127.0.0.1',
          },
          {
            name: 'metrics',
            containerPort: 9090,
            protocol: 'TCP',
          },
        ],
      },
    ]);
  });

  it('does not mutate the original input object or its nested arrays/objects', () => {
    const handleChange = vi.fn();
    const initialContainers = [makeReproContainer()];
    const deepFreeze = (obj: any): any => {
      Object.freeze(obj);
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          deepFreeze(obj[key]);
        }
      });
      return obj;
    };
    deepFreeze(initialContainers);

    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);
    const portInput = screen.getByLabelText('Container port');
    expect(() => {
      fireEvent.change(portInput, { target: { value: '5354' } });
    }).not.toThrow();

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        ports: [
          expect.objectContaining({ containerPort: 5354, name: 'dns' }),
          expect.objectContaining({ containerPort: 9090, name: 'metrics' }),
        ],
      }),
    ]);
  });

  it('preserves other containers when editing a container port', () => {
    const handleChange = vi.fn();
    const sidecar = {
      name: 'sidecar',
      image: 'envoyproxy/envoy',
      ports: [{ name: 'admin', containerPort: 9901, protocol: 'TCP' }],
    };
    const initialContainers = [makeReproContainer(), sidecar];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const portInputs = screen.getAllByLabelText('Container port');
    fireEvent.change(portInputs[0], { target: { value: '5354' } });

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'app',
        ports: [
          expect.objectContaining({ containerPort: 5354, name: 'dns' }),
          expect.objectContaining({ containerPort: 9090, name: 'metrics' }),
        ],
      }),
      sidecar,
    ]);
  });

  it('creates the expected port entry when container has no existing ports', () => {
    const handleChange = vi.fn();
    const initialContainers = [{ name: 'app', image: 'nginx:alpine' }];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '80' } });

    expect(handleChange).toHaveBeenCalledWith([
      {
        name: 'app',
        image: 'nginx:alpine',
        ports: [{ containerPort: 80 }],
      },
    ]);
  });

  it('preserves first-port metadata and second port when input is cleared', () => {
    const handleChange = vi.fn();
    const initialContainers = [makeReproContainer()];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'app',
        ports: [
          {
            name: 'dns',
            protocol: 'UDP',
            hostPort: 5353,
            hostIP: '127.0.0.1',
          },
          {
            name: 'metrics',
            containerPort: 9090,
            protocol: 'TCP',
          },
        ],
      }),
    ]);
  });

  it('preserves configuration and avoids editing second port during a sequence of controlled input updates', () => {
    let currentContainers: Record<string, any>[] = [makeReproContainer()];
    const { rerender } = render(
      <ContainerTextField
        value={currentContainers}
        onChange={updated => {
          currentContainers = updated;
        }}
      />
    );

    const portInput = screen.getByLabelText('Container port') as HTMLInputElement;

    // 1. User clears the input box
    fireEvent.change(portInput, { target: { value: '' } });
    rerender(
      <ContainerTextField
        value={currentContainers}
        onChange={updated => {
          currentContainers = updated;
        }}
      />
    );
    // Port input should be empty, NOT jumping to second port (9090)
    expect(portInput.value).toBe('');
    expect(currentContainers[0].ports).toHaveLength(2);
    expect(currentContainers[0].ports[1]).toEqual({
      name: 'metrics',
      containerPort: 9090,
      protocol: 'TCP',
    });

    // 2. User starts typing: "5"
    fireEvent.change(portInput, { target: { value: '5' } });
    rerender(
      <ContainerTextField
        value={currentContainers}
        onChange={updated => {
          currentContainers = updated;
        }}
      />
    );
    expect(currentContainers[0].ports[0].containerPort).toBe(5);
    expect(currentContainers[0].ports[0].name).toBe('dns');
    expect(currentContainers[0].ports[1].containerPort).toBe(9090);

    // 3. User finishes typing: "5354"
    fireEvent.change(portInput, { target: { value: '5354' } });
    rerender(
      <ContainerTextField
        value={currentContainers}
        onChange={updated => {
          currentContainers = updated;
        }}
      />
    );
    expect(currentContainers[0].ports[0]).toEqual({
      name: 'dns',
      containerPort: 5354,
      protocol: 'UDP',
      hostPort: 5353,
      hostIP: '127.0.0.1',
    });
    expect(currentContainers[0].ports[1]).toEqual({
      name: 'metrics',
      containerPort: 9090,
      protocol: 'TCP',
    });
  });

  it('removes ports property when clearing a bare container with only a single containerPort and no metadata', () => {
    const handleChange = vi.fn();
    const initialContainers = [{ name: 'app', image: 'nginx', ports: [{ containerPort: 80 }] }];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledWith([{ name: 'app', image: 'nginx' }]);
  });

  it('tolerates editing name or port on a null container row (e.g. from partially typed YAML) without throwing', () => {
    const handleChange = vi.fn();
    // Partially typed YAML: `containers:\n  -` parses to [null]
    render(<ContainerTextField value={[null as any]} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    expect(() => {
      fireEvent.change(portInput, { target: { value: '8080' } });
    }).not.toThrow();
    expect(handleChange).toHaveBeenCalledWith([{ ports: [{ containerPort: 8080 }] }]);

    const nameInput = screen.getByLabelText('Container name');
    expect(() => {
      fireEvent.change(nameInput, { target: { value: 'my-app' } });
    }).not.toThrow();
    expect(handleChange).toHaveBeenCalledWith([{ name: 'my-app' }]);
  });

  it('control test: editing container name preserves all ports and port metadata', () => {
    const handleChange = vi.fn();
    const initialContainers = [makeReproContainer()];
    render(<ContainerTextField value={initialContainers} onChange={handleChange} />);

    const nameInput = screen.getByLabelText('Container name');
    fireEvent.change(nameInput, { target: { value: 'app-renamed' } });

    expect(handleChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'app-renamed',
        ports: [
          {
            name: 'dns',
            containerPort: 5353,
            protocol: 'UDP',
            hostPort: 5353,
            hostIP: '127.0.0.1',
          },
          {
            name: 'metrics',
            containerPort: 9090,
            protocol: 'TCP',
          },
        ],
      }),
    ]);
  });

  it('displays field error and helper text when a container port entry is missing containerPort', () => {
    const handleChange = vi.fn();
    const containerWithIncompletePort = {
      name: 'app',
      image: 'nginx',
      ports: [{ name: 'dns', protocol: 'UDP' }],
    };

    render(<ContainerTextField value={[containerWithIncompletePort]} onChange={handleChange} />);

    expect(screen.getByText('Please enter a valid port number (1-65535).')).toBeDefined();
    const portInput = screen.getByLabelText('Container port');
    expect(portInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not display field error for a bare container without ports', () => {
    const handleChange = vi.fn();
    const bareContainer = {
      name: 'app',
      image: 'nginx',
    };

    render(<ContainerTextField value={[bareContainer]} onChange={handleChange} />);

    expect(screen.queryByText('Please enter a valid port number (1-65535).')).toBeNull();
    const portInput = screen.getByLabelText('Container port');
    expect(portInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('CreatePodForm workload form emits the complete resource preserving ports after port edit', () => {
    const handleChange = vi.fn();
    const podResource = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'port-edit-repro',
        namespace: 'default',
        labels: { app: 'port-edit-repro' },
      },
      spec: {
        containers: [makeReproContainer()],
      },
    };

    render(<CreatePodForm resource={podResource} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '5354' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'port-edit-repro',
          namespace: 'default',
          labels: { app: 'port-edit-repro' },
        },
        spec: expect.objectContaining({
          containers: [
            expect.objectContaining({
              name: 'app',
              env: [{ name: 'KEEP_ME', value: 'unchanged' }],
              ports: [
                {
                  name: 'dns',
                  containerPort: 5354,
                  protocol: 'UDP',
                  hostPort: 5353,
                  hostIP: '127.0.0.1',
                },
                {
                  name: 'metrics',
                  containerPort: 9090,
                  protocol: 'TCP',
                },
              ],
            }),
          ],
        }),
      })
    );
  });

  it('CreatePodForm reports form invalid via onValidChange and shows field error when clearing port with metadata, and recovers when a valid port is entered', () => {
    let currentResource = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'port-edit-validity',
        namespace: 'default',
      },
      spec: {
        containers: [makeReproContainer()],
      },
    };
    const handleChange = vi.fn((next: any) => {
      currentResource = next;
    });
    const handleValidChange = vi.fn();

    const { rerender } = render(
      <CreatePodForm
        resource={currentResource}
        onChange={handleChange}
        onValidChange={handleValidChange}
      />
    );

    // Initial state with valid containerPort (5353) is valid
    expect(handleValidChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText('Please enter a valid port number (1-65535).')).toBeNull();

    // 1. User clears the port input
    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '' } });

    // Emitted resource preserves dns metadata without containerPort
    expect(currentResource.spec.containers[0].ports[0]).toEqual({
      name: 'dns',
      protocol: 'UDP',
      hostPort: 5353,
      hostIP: '127.0.0.1',
    });

    // Re-render form with emitted resource
    rerender(
      <CreatePodForm
        resource={currentResource}
        onChange={handleChange}
        onValidChange={handleValidChange}
      />
    );

    // Form must be marked invalid and display field-level error
    expect(handleValidChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Please enter a valid port number (1-65535).')).toBeDefined();

    // 2. User types a valid port number again
    fireEvent.change(portInput, { target: { value: '5354' } });
    rerender(
      <CreatePodForm
        resource={currentResource}
        onChange={handleChange}
        onValidChange={handleValidChange}
      />
    );

    // Form becomes valid again and error is cleared
    expect(handleValidChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText('Please enter a valid port number (1-65535).')).toBeNull();
  });

  it('CreateDeploymentForm emits the complete resource preserving ports after port edit', () => {
    const handleChange = vi.fn();
    const deploymentResource = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'dep-edit-repro',
        namespace: 'default',
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'dep-edit-repro' } },
        template: {
          metadata: { labels: { app: 'dep-edit-repro' } },
          spec: {
            containers: [makeReproContainer()],
          },
        },
      },
    };

    render(<CreateDeploymentForm resource={deploymentResource} onChange={handleChange} />);

    const portInput = screen.getByLabelText('Container port');
    fireEvent.change(portInput, { target: { value: '5354' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        spec: expect.objectContaining({
          template: expect.objectContaining({
            spec: expect.objectContaining({
              containers: [
                expect.objectContaining({
                  name: 'app',
                  ports: [
                    {
                      name: 'dns',
                      containerPort: 5354,
                      protocol: 'UDP',
                      hostPort: 5353,
                      hostIP: '127.0.0.1',
                    },
                    {
                      name: 'metrics',
                      containerPort: 9090,
                      protocol: 'TCP',
                    },
                  ],
                }),
              ],
            }),
          }),
        }),
      })
    );
  });
});
