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

vi.mock('../../../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { ContainerTextField, PodLabelsEditor, formatCommand, parseCommand } = await import(
  './workloadFields'
);

describe('parseCommand and formatCommand', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['["sh", "-c", "echo hi"]', ['sh', '-c', 'echo hi']],
    ['[not-json foo', ['[not-json', 'foo']],
    ['sh -c "hello world" \'single quoted\'', ['sh', '-c', 'hello world', 'single quoted']],
    ['echo "escaped\\"quote" plain\\ space', ['echo', 'escaped"quote', 'plain space']],
  ])('parseCommand(%j) returns %j', (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it.each([
    [['sh', '-c'], '["sh","-c"]'],
    [[], ''],
    ['raw-string', 'raw-string'],
    [null, ''],
  ])('formatCommand(%j) returns %j', (input, expected) => {
    expect(formatCommand(input)).toBe(expected);
  });
});

describe('ContainerTextField', () => {
  it('supports adding, editing, command input on blur, and removing containers', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ContainerTextField
        label="Containers"
        helperText="Container list"
        required
        showCommand
        value={[
          {
            name: 'app',
            image: 'nginx:latest',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
            command: ['sh', '-c'],
          },
        ]}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Containers *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Container list' })).toBeInTheDocument();

    // Edit name and image
    fireEvent.change(screen.getByLabelText('Container name'), { target: { value: 'web' } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'web' })]);

    fireEvent.change(screen.getByLabelText('Container image'), { target: { value: 'busybox' } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ image: 'busybox' })]);

    // Edit command on focus/change/blur
    const cmdInput = screen.getByLabelText('Container command') as HTMLInputElement;
    expect(cmdInput.value).toBe('["sh","-c"]');
    fireEvent.focus(cmdInput);
    fireEvent.change(cmdInput, { target: { value: 'echo "hello world"' } });
    fireEvent.blur(cmdInput);
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ command: ['echo', 'hello world'] }),
    ]);

    // Add container
    fireEvent.click(screen.getByRole('button', { name: 'Add container' }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'app' }),
      { name: '', image: '', ports: [{ containerPort: 80 }], imagePullPolicy: 'Always' },
    ]);

    // Remove container
    fireEvent.click(screen.getByRole('button', { name: 'Remove container app' }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    // Sync external command update when unfocused
    rerender(
      <ContainerTextField
        showCommand
        value={[{ name: 'app', image: 'nginx', command: ['sleep', '10'] }]}
        onChange={onChange}
      />
    );
    expect((screen.getByLabelText('Container command') as HTMLInputElement).value).toBe(
      '["sleep","10"]'
    );
  });
});

describe('PodLabelsEditor', () => {
  it('renders locked labels, adds unique extra keys, edits, deletes, and syncs external changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PodLabelsEditor
        value={{ app: 'web', 'new-label': 'v1' }}
        lockedLabels={{ app: 'web' }}
        onChange={onChange}
      />
    );

    const keyInputs = screen.getAllByLabelText('Label key') as HTMLInputElement[];
    const valueInputs = screen.getAllByLabelText('Label value') as HTMLInputElement[];
    expect(keyInputs[0]).toBeDisabled();
    expect(keyInputs[0].value).toBe('app');
    expect(valueInputs[0]).toBeDisabled();
    expect(keyInputs[1]).not.toBeDisabled();
    expect(keyInputs[1].value).toBe('new-label');

    // Add row skips colliding 'new-label' -> 'new-label-2'
    fireEvent.click(screen.getByRole('button', { name: 'Add label' }));
    expect(onChange).toHaveBeenLastCalledWith({
      app: 'web',
      'new-label': 'v1',
      'new-label-2': '',
    });

    // Edit extra key and value
    const updatedKeys = screen.getAllByLabelText('Label key') as HTMLInputElement[];
    fireEvent.change(updatedKeys[2], { target: { value: 'tier' } });
    expect(onChange).toHaveBeenLastCalledWith({
      app: 'web',
      'new-label': 'v1',
      tier: '',
    });

    const updatedValues = screen.getAllByLabelText('Label value') as HTMLInputElement[];
    fireEvent.change(updatedValues[2], { target: { value: 'frontend' } });
    expect(onChange).toHaveBeenLastCalledWith({
      app: 'web',
      'new-label': 'v1',
      tier: 'frontend',
    });

    // Delete extra row
    fireEvent.click(screen.getByRole('button', { name: 'Remove label tier=frontend' }));
    expect(onChange).toHaveBeenLastCalledWith({
      app: 'web',
      'new-label': 'v1',
    });

    // External value sync
    rerender(
      <PodLabelsEditor
        value={{ app: 'web', env: 'prod' }}
        lockedLabels={{ app: 'web' }}
        onChange={onChange}
      />
    );
    expect(screen.getAllByLabelText('Label key').map(el => (el as HTMLInputElement).value)).toEqual(
      ['app', 'env']
    );
  });
});
