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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { useNamespaces } from '../../../redux/filterSlice';
import { TestContext } from '../../../test';
import EditorDialog from './EditorDialog';

vi.mock('../../../redux/filterSlice', async importOriginal => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useNamespaces: vi.fn(),
  };
});

describe('EditorDialog Namespace Warning', () => {
  const onCloseMock = vi.fn();
  const onSaveMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('useSimpleEditor', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('useSimpleEditor');
  });

  it('blocks save and shows warning when namespace is outside filter', async () => {
    vi.mocked(useNamespaces).mockReturnValue(['default']);

    render(
      <TestContext>
        <EditorDialog
          open
          item={{
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
              name: 'test-cm',
              namespace: 'kube-system',
            },
          }}
          onClose={onCloseMock}
          onSave={onSaveMock}
        />
      </TestContext>
    );

    // Simulate edit to enable the save button
    const codeInput = screen.getByRole('textbox', { name: /yaml Code/i });
    fireEvent.change(codeInput, {
      target: {
        value:
          'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test-cm\n  namespace: kube-system\n  labels:\n    foo: bar',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save & Apply/i })).not.toBeDisabled();
    });

    const saveBtn = screen.getByRole('button', { name: /Save & Apply/i });
    fireEvent.click(saveBtn);

    expect(onSaveMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Namespace Mismatch/i)).toBeInTheDocument();
  });

  it('proceeds with save when confirming the warning', async () => {
    vi.mocked(useNamespaces).mockReturnValue(['default']);

    render(
      <TestContext>
        <EditorDialog
          open
          item={{
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
              name: 'test-cm',
              namespace: 'kube-system',
            },
          }}
          onClose={onCloseMock}
          onSave={onSaveMock}
        />
      </TestContext>
    );

    const codeInput = screen.getByRole('textbox', { name: /yaml Code/i });
    fireEvent.change(codeInput, {
      target: {
        value:
          'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test-cm\n  namespace: kube-system\n  labels:\n    foo: bar',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save & Apply/i })).not.toBeDisabled();
    });

    const saveBtn = screen.getByRole('button', { name: /Save & Apply/i });
    fireEvent.click(saveBtn);

    // Warning dialog appeared, click "Yes"
    const confirmBtn = screen.getByLabelText('confirm-button');
    fireEvent.click(confirmBtn);

    expect(onSaveMock).toHaveBeenCalled();
  });

  it('does not trigger the warning for cluster-scoped resources', async () => {
    vi.mocked(useNamespaces).mockReturnValue(['default']);

    render(
      <TestContext>
        <EditorDialog
          open
          item={{
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: {
              name: 'new-namespace',
            },
          }}
          onClose={onCloseMock}
          onSave={onSaveMock}
        />
      </TestContext>
    );

    const codeInput = screen.getByRole('textbox', { name: /yaml Code/i });
    fireEvent.change(codeInput, {
      target: {
        value:
          'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: new-namespace\n  labels:\n    foo: bar',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save & Apply/i })).not.toBeDisabled();
    });

    const saveBtn = screen.getByRole('button', { name: /Save & Apply/i });
    fireEvent.click(saveBtn);

    expect(screen.queryByText(/Namespace Mismatch/i)).not.toBeInTheDocument();
    expect(onSaveMock).toHaveBeenCalled();
  });
});
