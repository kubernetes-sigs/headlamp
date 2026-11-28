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
import { TestContext } from '../../test';
import { SearchSettings } from './SearchSettings';

/**
 * Renders the settings, enters a max items value and saves it.
 *
 * @param value - Text typed into the max items field.
 * @returns The mock that receives the saved max items value.
 */
function saveMaxItems(value: string) {
  const setMaxItemsPerResource = vi.fn();

  render(
    <TestContext>
      <SearchSettings
        maxItemsPerResource={10_000}
        setMaxItemsPerResource={setMaxItemsPerResource}
        refetchIntervalMs={60_000}
        setRefetchIntervalMs={() => {}}
      />
    </TestContext>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  return setMaxItemsPerResource;
}

describe('SearchSettings', () => {
  it('saves a positive whole number', () => {
    expect(saveMaxItems('500')).toHaveBeenCalledWith(500);
  });

  it('reads exponent notation as the number it stands for', () => {
    expect(saveMaxItems('1e4')).toHaveBeenCalledWith(10_000);
  });

  it.each(['', '0', '-1', '1.5'])('keeps the previous limit for %j', value => {
    expect(saveMaxItems(value)).not.toHaveBeenCalled();
  });
});
