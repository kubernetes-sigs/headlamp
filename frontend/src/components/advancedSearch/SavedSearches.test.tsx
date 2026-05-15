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
import { describe, expect, it } from 'vitest';
import { TestContext } from '../../test';
import { SavedSearches } from './SavedSearches';

describe('SavedSearches', () => {
  it('opens the saved searches popover when clicked', () => {
    render(
      <TestContext>
        <SavedSearches rawQuery="" resourcesValue="" onSearchSelected={() => {}} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Saved Searches' }));

    expect(screen.getByText('Save current search')).toBeInTheDocument();
    expect(screen.getByText('No saved searches yet.')).toBeInTheDocument();
  });
});
