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
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// See CreateResourceForm.test.tsx: avoid the lib/k8s barrel cycle.
vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: () => [[], null] },
}));

const { default: CreatePVCForm } = await import('./CreatePVCForm');

/** Renders the form with its resource kept in state, like the create dialog does. */
function renderForm(initial: Record<string, any> = {}) {
  const latest: { resource: Record<string, any> } = { resource: initial };
  function Harness() {
    const [resource, setResource] = React.useState(initial);
    return (
      <CreatePVCForm
        resource={resource}
        onChange={next => {
          latest.resource = next;
          setResource(next);
        }}
      />
    );
  }
  render(<Harness />);
  return latest;
}

const storageClassInput = () => screen.queryByRole('textbox', { name: 'Storage Class' });
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

describe('CreatePVCForm StorageClass field', () => {
  it('keeps the input in Specify mode when its text is cleared to type a new name', () => {
    const latest = renderForm({ spec: { storageClassName: 'fast-ssd' } });
    expect(radio('Specify StorageClass').checked).toBe(true);

    fireEvent.change(storageClassInput()!, { target: { value: '' } });

    expect(storageClassInput()).toBeInTheDocument();
    expect(radio('Specify StorageClass').checked).toBe(true);
    expect(latest.resource.spec?.storageClassName).toBeUndefined();

    fireEvent.change(storageClassInput()!, { target: { value: 'slow-hdd' } });

    expect((storageClassInput() as HTMLInputElement).value).toBe('slow-hdd');
    expect(latest.resource.spec.storageClassName).toBe('slow-hdd');
  });

  it('still switches modes with the radio buttons', () => {
    const latest = renderForm({ spec: { storageClassName: 'fast-ssd' } });

    fireEvent.click(radio('Use default StorageClass'));
    expect(storageClassInput()).not.toBeInTheDocument();
    expect(latest.resource.spec?.storageClassName).toBeUndefined();

    fireEvent.click(radio('No StorageClass (static provisioning)'));
    expect(latest.resource.spec.storageClassName).toBe('');

    fireEvent.click(radio('Specify StorageClass'));
    expect(storageClassInput()).toBeInTheDocument();
  });

  it('picks the mode from an existing resource', () => {
    renderForm({ spec: { storageClassName: '' } });
    expect(radio('No StorageClass (static provisioning)').checked).toBe(true);
  });
});
