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
import React from 'react';
import spacetime from 'spacetime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimezoneSelect from './TimezoneSelect';

let currentLanguage = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
    i18n: { language: currentLanguage },
  }),
}));

describe('TimezoneSelect', () => {
  beforeEach(() => {
    currentLanguage = 'en';
    vi.clearAllMocks();
  });

  it('renders autocomplete input with helper text and empty initial value when initialTimezone is omitted', () => {
    render(<TimezoneSelect onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('id', 'timezone-selector-autocomplete');
    expect(screen.getByText('Timezone')).toBeInTheDocument();
  });

  it('renders with pre-selected value matching initialTimezone', () => {
    render(<TimezoneSelect initialTimezone="UTC" onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('(UTC+0) UTC');
  });

  it('renders with pre-selected positive offset timezone', () => {
    render(<TimezoneSelect initialTimezone="Asia/Tokyo" onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('(UTC+9) Asia/Tokyo');
  });

  it('renders with empty value if initialTimezone does not match any option', () => {
    render(<TimezoneSelect initialTimezone="Invalid/Non_Existent" onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('');
  });

  it('sets aria-label fallback when nameLabelID is not provided', () => {
    render(<TimezoneSelect onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-label', 'Timezone');
    expect(input).not.toHaveAttribute('aria-labelledby');
  });

  it('sets aria-labelledby and omits aria-label when nameLabelID is provided', () => {
    render(<TimezoneSelect nameLabelID="custom-timezone-label-id" onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-labelledby', 'custom-timezone-label-id');
    expect(input).not.toHaveAttribute('aria-label');
  });

  it('calls onChange with selected timezone name on user selection via keyboard', () => {
    const handleChange = vi.fn();
    render(<TimezoneSelect onChange={handleChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Tokyo' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('Asia/Tokyo');
  });

  it('calls onChange when selecting an option from dropdown click', () => {
    const handleChange = vi.fn();
    render(<TimezoneSelect onChange={handleChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.mouseDown(input);

    const option = screen.getByRole('option', { name: '(UTC+0) UTC' });
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith('UTC');
  });

  it('memoizes timezone options on same-language rerenders and recalculates when language changes', () => {
    const timezonesSpy = vi.spyOn(spacetime, 'timezones');
    timezonesSpy.mockClear();

    const { rerender } = render(<TimezoneSelect initialTimezone="UTC" onChange={vi.fn()} />);

    expect(timezonesSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox')).toHaveValue('(UTC+0) UTC');

    // Rerender with unchanged language - should reuse memoized options
    rerender(<TimezoneSelect initialTimezone="UTC" onChange={vi.fn()} />);
    expect(timezonesSpy).toHaveBeenCalledTimes(1);

    // Language change - should regenerate options
    currentLanguage = 'fr';
    rerender(<TimezoneSelect initialTimezone="UTC" onChange={vi.fn()} />);
    expect(timezonesSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('combobox')).toHaveValue('(UTC+0) UTC');

    timezonesSpy.mockRestore();
  });
});
