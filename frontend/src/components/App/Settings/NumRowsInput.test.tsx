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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import NumRowsInput from './NumRowsInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { minRows?: number; maxRows?: number }) =>
      (key.split('|')[1] || key)
        .replace('{{ minRows }}', `${values?.minRows}`)
        .replace('{{ maxRows }}', `${values?.maxRows}`),
  }),
}));

function renderNumRowsInput() {
  render(
    <TestContext>
      <NumRowsInput defaultValue={[5, 15, 25]} />
    </TestContext>
  );
}

describe('NumRowsInput', () => {
  it('rejects decimal custom row values', () => {
    renderNumRowsInput();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Custom value' }));

    const input = screen.getByPlaceholderText('Custom row value');
    const applyButton = screen.getByRole('button', { name: 'Apply' });

    fireEvent.change(input, { target: { value: '10' } });

    expect(input).toHaveValue(10);
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(applyButton).toBeEnabled();

    fireEvent.change(input, { target: { value: '10.5' } });

    expect(input).toHaveValue(10.5);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(applyButton).toBeDisabled();
  });
});
