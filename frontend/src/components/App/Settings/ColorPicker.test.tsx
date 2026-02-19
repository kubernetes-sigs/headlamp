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

import '@testing-library/jest-dom';
import { fireEvent,render, screen } from '@testing-library/react';
import i18n from 'i18next';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, test, vi } from 'vitest';
import ColorPicker from './ColorPicker';

i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
});

const renderComponent = (props = {}) => {
  const defaultProps = {
    open: true,
    currentColor: '',
    onClose: vi.fn(),
    onSelectColor: vi.fn(),
    onError: vi.fn(),
  };

  return render(
    <I18nextProvider i18n={i18n}>
      <ColorPicker {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('ColorPicker', () => {
  test('renders dialog when open', () => {
    renderComponent();
    expect(screen.getByText(/Choose Accent Color/i)).toBeInTheDocument();
  });

  test('selects preset color and closes dialog', () => {
    const onSelectColor = vi.fn();
    const onClose = vi.fn();

    renderComponent({ onSelectColor, onClose });

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);

    expect(onSelectColor).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('enables custom color mode when checkbox clicked', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByPlaceholderText('#ff0000')).toBeInTheDocument();
  });

  test('disables Apply button for invalid custom color', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: 'invalid' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });

    expect(applyButton).toBeDisabled();
  });

  test('Apply button is disabled when custom color input is empty', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    const applyButton = screen.getByRole('button', { name: /apply/i });

    expect(applyButton).toBeDisabled();
  });

  test('applies valid custom color and closes dialog', () => {
    const onSelectColor = vi.fn();
    const onClose = vi.fn();

    renderComponent({ onSelectColor, onClose });

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: '#123456' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });

    fireEvent.click(applyButton);

    expect(onSelectColor).toHaveBeenCalledWith('#123456');
    expect(onClose).toHaveBeenCalled();
  });
});
