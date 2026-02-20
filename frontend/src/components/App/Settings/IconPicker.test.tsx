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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IconPicker, { PRESET_ICONS } from './IconPicker';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

describe('IconPicker Component', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onSelectIcon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onSelectIcon = vi.fn();
  });

  const renderComponent = (props = {}) =>
    render(
      <IconPicker open currentIcon="" onClose={onClose} onSelectIcon={onSelectIcon} {...props} />
    );

  it('renders dialog title', () => {
    renderComponent();
    expect(screen.getByText('Choose Cluster Icon')).toBeInTheDocument();
  });

  it('renders all preset icons', () => {
    renderComponent();

    PRESET_ICONS.forEach(icon => {
      expect(screen.getByRole('button', { name: icon.name })).toBeInTheDocument();
    });
  });

  it('highlights selected preset icon', () => {
    renderComponent({ currentIcon: PRESET_ICONS[0].value });

    const selectedButton = screen.getByRole('button', {
      name: PRESET_ICONS[0].name,
    });

    expect(selectedButton).toHaveClass('Mui-selected');
  });

  it('calls onSelectIcon and onClose when preset icon clicked', () => {
    renderComponent();

    const button = screen.getByRole('button', {
      name: PRESET_ICONS[0].name,
    });

    fireEvent.click(button);

    expect(onSelectIcon).toHaveBeenCalledWith(PRESET_ICONS[0].value);
    expect(onClose).toHaveBeenCalled();
  });

  it('enables custom icon mode when checkbox is clicked', () => {
    renderComponent();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByPlaceholderText('mdi:shield-alert')).toBeInTheDocument();
  });

  it('Apply button is disabled when custom input is empty', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    expect(applyButton).toBeDisabled();
  });

  it('Apply button becomes enabled when custom input has value', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('mdi:shield-alert');
    fireEvent.change(input, {
      target: { value: 'mdi:cloud-outline' },
    });

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    expect(applyButton).not.toBeDisabled();
  });

  it('calls onSelectIcon with custom icon value when Apply clicked', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('checkbox'));

    const input = screen.getByPlaceholderText('mdi:shield-alert');
    fireEvent.change(input, {
      target: { value: 'mdi:cloud-outline' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onSelectIcon).toHaveBeenCalledWith('mdi:cloud-outline');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel clicked', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not render dialog when open is false', () => {
    render(
      <IconPicker open={false} currentIcon="" onClose={onClose} onSelectIcon={onSelectIcon} />
    );

    expect(screen.queryByText('Choose Cluster Icon')).not.toBeInTheDocument();
  });
});
