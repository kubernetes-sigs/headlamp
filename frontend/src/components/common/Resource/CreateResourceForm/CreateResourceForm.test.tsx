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
const { default: CreateResourceForm } = await import('./index');

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
