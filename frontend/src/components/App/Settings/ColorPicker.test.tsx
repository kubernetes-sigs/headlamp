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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, test, vi } from 'vitest';
import i18n from '../../../i18n/config';
import ColorPicker from './ColorPicker';

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

    const presetButtons = screen.getAllByRole('button').filter(btn => btn.getAttribute('value'));

    expect(presetButtons.length).toBeGreaterThan(0);

    fireEvent.click(presetButtons[0]);

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

  test('applies valid hex custom color and closes dialog', () => {
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

  test('calls onClose when Cancel is clicked without selecting color', () => {
    const onSelectColor = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();

    renderComponent({ onSelectColor, onClose, onError });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
    expect(onSelectColor).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('highlights preset color when it matches currentColor', () => {
    const onClose = vi.fn();
    const onSelectColor = vi.fn();

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ColorPicker open currentColor="" onClose={onClose} onSelectColor={onSelectColor} />
      </I18nextProvider>
    );

    const presetButtons = screen.getAllByRole('button').filter(btn => btn.getAttribute('value'));

    expect(presetButtons.length).toBeGreaterThan(0);

    const presetButton = presetButtons[0];
    const presetColor = presetButton.getAttribute('value') as string;

    expect(presetColor).toBeTruthy();

    rerender(
      <I18nextProvider i18n={i18n}>
        <ColorPicker
          open
          currentColor={presetColor}
          onClose={onClose}
          onSelectColor={onSelectColor}
        />
      </I18nextProvider>
    );

    const matchedButton = screen
      .getAllByRole('button')
      .find(btn => btn.getAttribute('value') === presetColor);

    expect(matchedButton).toBeDefined();
    expect(matchedButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('opens with preset color selected and checkbox unchecked', () => {
    const onClose = vi.fn();
    const onSelectColor = vi.fn();
    const presetColor = '#2196f3';

    renderComponent({ currentColor: presetColor, onClose, onSelectColor });

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    const matchedButton = screen
      .getAllByRole('button')
      .find(btn => btn.getAttribute('value') === presetColor);
    expect(matchedButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens with non-preset hex color and checkbox checked with input prefilled', () => {
    const onClose = vi.fn();
    const onSelectColor = vi.fn();

    renderComponent({ currentColor: '#123456', onClose, onSelectColor });

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByPlaceholderText('#ff0000')).toHaveValue('#123456');
  });

  test('opens with non-preset rgba color and checkbox checked with input prefilled', () => {
    const onClose = vi.fn();
    const onSelectColor = vi.fn();

    renderComponent({ currentColor: 'rgba(10, 20, 30, 0.5)', onClose, onSelectColor });

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByPlaceholderText('#ff0000')).toHaveValue('rgba(10, 20, 30, 0.5)');
  });

  test('applies valid rgb custom color and closes dialog', () => {
    const onSelectColor = vi.fn();
    const onClose = vi.fn();

    renderComponent({ onSelectColor, onClose });

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: 'rgb(255, 0, 0)' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).not.toBeDisabled();

    fireEvent.click(applyButton);

    expect(onSelectColor).toHaveBeenCalledWith('rgb(255, 0, 0)');
    expect(onClose).toHaveBeenCalled();
  });

  test('applies valid rgba custom color and closes dialog', () => {
    const onSelectColor = vi.fn();
    const onClose = vi.fn();

    renderComponent({ onSelectColor, onClose });

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: 'rgba(255, 0, 0, 0.5)' } });

    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).not.toBeDisabled();

    fireEvent.click(applyButton);

    expect(onSelectColor).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)');
    expect(onClose).toHaveBeenCalled();
  });
  test('opens and dismisses the palette popover', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryAllByRole('slider')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText(/select custom color/i));
    const sliders = await screen.findAllByRole('slider');

    fireEvent.keyDown(sliders[0], { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryAllByRole('slider')).toHaveLength(0);
    });
  });

  test('picker changes the input and the value is applied', async () => {
    const onSelectColor = vi.fn();
    renderComponent({ onSelectColor, onClose: vi.fn(), currentColor: '' });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByLabelText(/select custom color/i));

    const sliders = await screen.findAllByRole('slider');
    const alphaSlider = sliders[sliders.length - 1];
    fireEvent.keyDown(alphaSlider, { key: 'ArrowLeft', keyCode: 37 });
    fireEvent.keyDown(alphaSlider, { key: 'ArrowLeft', keyCode: 37 });

    const input = screen.getByPlaceholderText('#ff0000') as HTMLInputElement;
    expect(input.value).toMatch(/^rgba\(255, 0, 0, 0\.\d+\)$/);

    fireEvent.keyDown(alphaSlider, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryAllByRole('slider')).toHaveLength(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(onSelectColor).toHaveBeenCalledWith(input.value);
  });

  test('out-of-range rgb channels are clamped to 255 in the picker', async () => {
    renderComponent({ currentColor: '' });

    fireEvent.click(screen.getByRole('checkbox'));
    const input = screen.getByPlaceholderText('#ff0000') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'rgb(300, 0, 0)' } });
    fireEvent.click(screen.getByLabelText(/select custom color/i));

    const sliders = await screen.findAllByRole('slider');
    const alphaSlider = sliders[sliders.length - 1];
    fireEvent.keyDown(alphaSlider, { key: 'ArrowLeft', keyCode: 37 });

    expect(input.value).toMatch(/^rgba\(255, 0, 0, 0\.\d+\)$/);
  });

  test('input to picker/swatch: typing hex updates swatch backgroundColor', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('checkbox'));
    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: '#123456' } });
    const swatch = screen.getByLabelText(/select custom color/i);
    expect(swatch).toHaveStyle({ backgroundColor: 'rgb(18, 52, 86)' });
  });

  test('Cancel then reopen on the same mounted component resets custom color draft', async () => {
    const onClose = vi.fn();
    const onSelectColor = vi.fn();

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <I18nextProvider i18n={i18n}>
          <button onClick={() => setOpen(true)}>reopen</button>
          <ColorPicker
            open={open}
            currentColor=""
            onClose={() => {
              setOpen(false);
              onClose();
            }}
            onSelectColor={onSelectColor}
          />
        </I18nextProvider>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('checkbox'));
    const input = screen.getByPlaceholderText('#ff0000');
    fireEvent.change(input, { target: { value: '#00ff00' } });
    expect(input).toHaveValue('#00ff00');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reopen/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByPlaceholderText('#ff0000')).toHaveValue('');
    const swatchAfter = screen.getByLabelText(/select custom color/i);
    expect(swatchAfter).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)' });
  });
});
